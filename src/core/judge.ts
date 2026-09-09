// 판정 엔진 — Tech Spec §3. 순수 로직만 두고 DOM · 오디오에 의존하지 않는다.
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
import type { Pattern, PatternId, SessionResult } from '../types';

/** 부동소수점 비교 오차 흡수용. 1e-6ms = 1피코초 수준이라 판정에 영향이 없다. */
const EPSILON_MS = 1e-6;

/** 한 번의 탭 입력이 어떻게 처리되었는지. 화면 피드백에 그대로 쓴다. */
export type TapOutcome = 'perfect' | 'good' | 'extra' | 'ignored';

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
  /** 탭 입력 1건을 처리하고 화면에 표시할 판정을 돌려준다. */
  tap(rawTime: number): TapOutcome;
  /** now 시점까지 miss가 확정된 기대 탭의 인덱스. 한 번 보고한 건 다시 나오지 않는다. */
  collectMisses(now: number): number[];
  /** 세션 집계. 미매칭 기대 탭은 모두 miss로 계산한다. */
  result(patternId: PatternId, bpm: number): SessionResult;
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
  const verdicts: (TapOutcome & ('perfect' | 'good') | null)[] = expected.map(
    () => null,
  );
  const missReported = expected.map(() => false);

  let lastAcceptedTap = -Infinity;
  let extraTaps = 0;

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

  return {
    tap(rawTime) {
      // 1. 채터링 방지 — 직전에 받아들인 입력과 너무 붙어 있으면 버린다
      if ((rawTime - lastAcceptedTap) * 1000 < DEBOUNCE_MS - EPSILON_MS) {
        return 'ignored';
      }
      lastAcceptedTap = rawTime;

      // 2. 지연 보정을 적용한 뒤 판정한다
      const adjusted = rawTime - offsetMs / 1000;

      // 3. 가장 가까운 미매칭 기대 탭을 찾는다
      const index = nearestUnmatched(adjusted);
      if (index === -1) {
        extraTaps++;
        return 'extra';
      }

      // 4. 해당 기대 탭의 허용 오차 안이면 매칭 확정
      const distanceMs = Math.abs(adjusted - expected[index]!) * 1000;
      const window = windows[index]!;
      if (distanceMs <= window.perfectMs + EPSILON_MS) {
        verdicts[index] = 'perfect';
        return 'perfect';
      }
      if (distanceMs <= window.goodMs + EPSILON_MS) {
        verdicts[index] = 'good';
        return 'good';
      }

      // 5. 창 밖의 입력은 추가 탭으로 별도 집계 (정확도 분모에 불포함)
      extraTaps++;
      return 'extra';
    },

    collectMisses(now) {
      const confirmed: number[] = [];
      for (let i = 0; i < expected.length; i++) {
        if (verdicts[i] !== null || missReported[i]) continue;
        const deadline = expected[i]! + windows[i]!.goodMs / 1000;
        if (now > deadline + EPSILON_MS) {
          missReported[i] = true;
          confirmed.push(i);
        }
      }
      return confirmed;
    },

    result(patternId, bpm) {
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
        playedAt: new Date().toISOString(),
      };
    },
  };
}
