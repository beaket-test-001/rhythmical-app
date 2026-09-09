// 판정 엔진 — Tech Spec §3. DOM · 오디오에 의존하지 않고 시각은 전부 인자로
// 받으므로 판정은 결정적이다.
//
// 시간 축 주의: 기대 탭과 입력 탭 모두 AudioContext 축(초)이다.
// performance.now()(ms) → AudioContext(초) 변환은 호출부(연습 화면)의 책임이다.
import {
  COUNT_IN_BARS,
  DEBOUNCE_MS,
  GOOD_WINDOW_MS,
  PERFECT_WINDOW_MS,
  PLAY_BARS,
} from '../constants';
import type { Pattern, PatternId, SessionResult, Verdict } from '../types';

/** 부동소수점 비교 오차 흡수용. 1e-6ms = 1피코초 수준이라 판정에 영향이 없다. */
const EPSILON_MS = 1e-6;

/** 매칭에 성공한 탭의 판정. miss는 입력이 아니라 미입력이라 여기 없다. */
export type MatchedVerdict = Exclude<Verdict, 'miss'>;

/** 한 번의 탭 입력이 어떻게 처리되었는지. 화면 피드백에 그대로 쓴다. */
export type TapOutcome = MatchedVerdict | 'extra' | 'ignored';

/** 기대 탭 하나에 적용되는 허용 오차(ms). */
export interface TapWindow {
  perfectMs: number;
  goodMs: number;
}

/**
 * 연습 구간의 기대 탭 시각을 만든다.
 * @param startTime 카운트인 첫 박의 AudioContext 시각(초)
 */
export function expectedTapTimes(
  pattern: Pattern,
  bpm: number,
  startTime: number,
): number[] {
  const secondsPerBeat = 60 / bpm;
  const beatsPerBar = pattern.timeSignature[0];
  const playStart = startTime + COUNT_IN_BARS * beatsPerBar * secondsPerBeat;

  const times: number[] = [];
  for (let bar = 0; bar < PLAY_BARS; bar++) {
    for (const tap of pattern.taps) {
      times.push(playStart + (bar * beatsPerBar + tap) * secondsPerBeat);
    }
  }
  return times;
}

/**
 * 기대 탭별 허용 오차를 계산한다 (§3.6 동적 윈도우).
 *
 * 인접 간격이 좁으면 고정 창(±120ms)이 서로 겹쳐 어떤 기대 탭에 매칭할지
 * 모호해진다. 그래서 good을 인접 간격의 절반까지 좁히고, perfect도 그 이내로
 * 클램프한다. 인접 간격은 앞·뒤 기대 탭까지 거리 중 작은 값이다 (§3.7).
 */
export function tapWindows(expected: number[]): TapWindow[] {
  return expected.map((time, i) => {
    const toPrev = i > 0 ? time - expected[i - 1]! : Infinity;
    const toNext = i < expected.length - 1 ? expected[i + 1]! - time : Infinity;
    const gapMs = Math.min(toPrev, toNext) * 1000;

    const goodMs = Math.min(GOOD_WINDOW_MS, gapMs / 2);
    return { perfectMs: Math.min(PERFECT_WINDOW_MS, goodMs), goodMs };
  });
}

export interface Judger {
  /**
   * 모든 판정이 확정되는 시각. 마지막 기대 탭의 허용 창이 닫히는 때다.
   *
   * 마디가 끝나는 시각보다 늦을 수 있다. 예를 들어 120BPM eighth-mix는
   * 마지막 기대 탭이 마디 끝보다 0.25초 앞서지만, 지연 보정 +200ms를 주면
   * 창이 마디 끝 뒤에 닫힌다. 화면은 이 시각까지 기다려야 마지막 판정을
   * 놓치지 않는다 (Tech Spec §3 종료 집계).
   */
  readonly settledAt: number;
  /** 탭 입력 1건을 처리하고 화면에 표시할 판정을 돌려준다. */
  tap(rawTime: number): TapOutcome;
  /** now 시점까지 miss가 확정된 기대 탭의 인덱스. 한 번 보고한 건 다시 나오지 않는다. */
  collectMisses(now: number): number[];
  /**
   * 세션 집계. 미매칭 기대 탭은 모두 miss로 계산한다.
   * @param playedAt 생략하면 호출 시각. 테스트에서 고정하기 위한 인자다.
   */
  result(patternId: PatternId, bpm: number, playedAt?: string): SessionResult;
}

/**
 * 기대 탭 목록에 대한 증분 판정기를 만든다.
 *
 * 세션 종료를 기다리지 않고 탭마다 즉시 판정을 돌려주므로, 화면은 100ms 이내
 * 피드백 요건을 만족할 수 있다.
 *
 * @param offsetMs 지연 보정. 소리가 늦게 들리는 기기일수록 양수 (§3)
 */
export function createJudger(expected: number[], offsetMs: number): Judger {
  const windows = tapWindows(expected);
  /** 기대 탭별 판정. null이면 아직 미매칭. */
  const verdicts: (MatchedVerdict | null)[] = expected.map(() => null);
  const missReported = expected.map(() => false);

  /** 채터링 판정 기준. 무시된 입력도 포함한다 — 바운스는 연쇄로 들어오기 때문. */
  let lastTap = -Infinity;
  let extraTaps = 0;

  // 첫 기대 탭의 허용 창이 열리기 전 = 아직 카운트인 구간.
  // PRD §5 "카운트인 중 입력은 판정하지 않는다" — 추가 탭으로도 세지 않는다.
  // 창 시작을 경계로 잡아, 첫 박을 살짝 앞서 치는 정상 입력은 살린다.
  const countInEndsAt =
    expected.length === 0
      ? Infinity
      : expected[0]! - windows[0]!.goodMs / 1000;

  /** 아직 매칭되지 않은 기대 탭 중 가장 가까운 것의 인덱스. */
  const nearestUnmatched = (time: number): number => {
    let best = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < expected.length; i++) {
      if (verdicts[i] !== null) continue;
      const distance = Math.abs(time - expected[i]!);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    return best;
  };

  const lastIndex = expected.length - 1;

  return {
    settledAt:
      lastIndex < 0
        ? 0
        : expected[lastIndex]! + (offsetMs + windows[lastIndex]!.goodMs) / 1000,

    tap(rawTime) {
      // 1. 채터링 방지 — 직전 입력과 60ms 이내면 버린다.
      //    PRD §5는 "이내"(경계 포함)라 Tech Spec §3.1의 "미만"보다 우선한다.
      const sinceLastMs = (rawTime - lastTap) * 1000;
      lastTap = rawTime;
      if (sinceLastMs <= DEBOUNCE_MS + EPSILON_MS) return 'ignored';

      // 2. 지연 보정을 적용한 뒤 판정한다
      const adjusted = rawTime - offsetMs / 1000;

      // 3. 카운트인 구간의 입력은 판정 대상이 아니다
      if (adjusted < countInEndsAt - EPSILON_MS) return 'ignored';

      // 4. 가장 가까운 미매칭 기대 탭을 찾는다
      const index = nearestUnmatched(adjusted);
      if (index === -1) {
        extraTaps++;
        return 'extra';
      }

      // 5. 해당 기대 탭의 허용 오차 안이면 매칭 확정
      const distanceMs = Math.abs(adjusted - expected[index]!) * 1000;
      const tapWindow = windows[index]!;
      if (distanceMs <= tapWindow.perfectMs + EPSILON_MS) {
        verdicts[index] = 'perfect';
        return 'perfect';
      }
      if (distanceMs <= tapWindow.goodMs + EPSILON_MS) {
        verdicts[index] = 'good';
        return 'good';
      }

      // 6. 창 밖의 입력은 추가 탭으로 별도 집계 (정확도 분모에 불포함)
      extraTaps++;
      return 'extra';
    },

    collectMisses(now) {
      const confirmed: number[] = [];
      for (let i = 0; i < expected.length; i++) {
        if (verdicts[i] !== null || missReported[i]) continue;
        // 마감은 tap()과 같은 축에서 계산해야 한다. tap()이 raw에서 offset을
        // 빼고 비교하므로, raw 축의 유효 창은 expected + offset을 중심으로 열린다.
        // 이 항을 빼먹으면 offset이 클 때 창이 열리기도 전에 miss가 확정되어
        // 화면 피드백과 최종 집계가 어긋난다.
        const deadline = expected[i]! + (offsetMs + windows[i]!.goodMs) / 1000;
        if (now > deadline + EPSILON_MS) {
          missReported[i] = true;
          confirmed.push(i);
        }
      }
      return confirmed;
    },

    result(patternId, bpm, playedAt = new Date().toISOString()) {
      const perfect = verdicts.filter((v) => v === 'perfect').length;
      const good = verdicts.filter((v) => v === 'good').length;
      const miss = expected.length - perfect - good;

      const score = perfect * 1.0 + good * 0.5;
      const raw = expected.length === 0 ? 0 : (score / expected.length) * 100;

      return {
        patternId,
        bpm,
        accuracy: Math.round(raw * 10) / 10, // 소수 1자리
        counts: { perfect, good, miss },
        extraTaps,
        playedAt,
      };
    },
  };
}
