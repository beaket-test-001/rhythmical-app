import { describe, it, expect } from 'vitest';
import { createJudger, expectedTapTimes, tapWindows } from '../src/core/judge';
import { PATTERNS } from '../src/core/patterns';
import { COUNT_IN_BARS, PLAY_BARS } from '../src/constants';
import type { Pattern } from '../src/types';

const pattern = (id: string): Pattern => PATTERNS.find((p) => p.id === id)!;
const quarter = pattern('quarter');
const triplet = pattern('triplet');

/** ms를 초로. 판정기는 AudioContext 축(초)을 쓴다. */
const ms = (v: number) => v / 1000;

describe('expectedTapTimes', () => {
  it('카운트인 1마디를 건너뛰고 연습 4마디의 기대 탭을 만든다', () => {
    const times = expectedTapTimes(quarter, 60, 0); // 60BPM → 1박 = 1초
    expect(times.length).toBe(PLAY_BARS * quarter.taps.length); // 4마디 × 4탭
    // 카운트인 1마디(4박) 뒤부터 시작
    expect(times[0]).toBeCloseTo(COUNT_IN_BARS * 4, 10);
    expect(times[1]).toBeCloseTo(5, 10);
    expect(times[4]).toBeCloseTo(8, 10); // 두 번째 마디 첫 박
  });

  it('startTime과 BPM이 기대 시각에 반영된다', () => {
    const times = expectedTapTimes(quarter, 120, 10); // 120BPM → 1박 = 0.5초
    expect(times[0]).toBeCloseTo(10 + 4 * 0.5, 10);
    expect(times[1]).toBeCloseTo(12.5, 10);
  });
});

describe('tapWindows — 동적 윈도우 (§3.6)', () => {
  it('간격이 넓으면 사양의 고정 허용 오차를 그대로 쓴다', () => {
    const w = tapWindows(expectedTapTimes(quarter, 80, 0)); // 1박 750ms
    expect(w[0]).toEqual({ perfectMs: 50, goodMs: 120 });
  });

  it('셋잇단 100BPM(간격 200ms)에서 good이 100ms로 축소된다', () => {
    const w = tapWindows(expectedTapTimes(triplet, 100, 0));
    // 셋잇단 탭 위치가 k + j/3이라 간격에 부동소수점 오차가 남는다(1e-13ms 수준)
    expect(w[5]!.goodMs).toBeCloseTo(100, 9); // min(120, 200/2)
    expect(w[5]!.perfectMs).toBe(50); // perfect는 good 이내로 클램프
  });

  it('good이 perfect보다 좁아지면 perfect도 함께 클램프된다', () => {
    // 간격 60ms인 인위적 기대 탭 → good = 30ms, perfect도 30ms
    const w = tapWindows([0, 0.06, 0.12]);
    expect(w[1]).toEqual({ perfectMs: 30, goodMs: 30 });
  });
});

describe('createJudger — 판정 경계값 (§8)', () => {
  const expected = expectedTapTimes(quarter, 80, 0);

  const judgeOne = (deltaMs: number, offsetMs = 0) => {
    const j = createJudger(expected, offsetMs);
    return j.tap(expected[0]! + ms(deltaMs));
  };

  it('오차 0ms는 perfect', () => expect(judgeOne(0)).toBe('perfect'));
  it('오차 +50ms는 perfect (경계 포함)', () => expect(judgeOne(50)).toBe('perfect'));
  it('오차 -50ms는 perfect (경계 포함)', () => expect(judgeOne(-50)).toBe('perfect'));
  it('오차 +51ms는 good', () => expect(judgeOne(51)).toBe('good'));
  it('오차 -51ms는 good', () => expect(judgeOne(-51)).toBe('good'));
  it('오차 +120ms는 good (경계 포함)', () => expect(judgeOne(120)).toBe('good'));
  it('오차 -120ms는 good (경계 포함)', () => expect(judgeOne(-120)).toBe('good'));
  it('오차 +121ms는 매칭 실패 → 추가 탭', () => expect(judgeOne(121)).toBe('extra'));
  it('오차 -121ms는 매칭 실패 → 추가 탭', () => expect(judgeOne(-121)).toBe('extra'));

  it('지연 보정: offset +100ms면 100ms 늦은 탭이 perfect가 된다', () => {
    expect(judgeOne(100)).toBe('good'); // 보정 없으면 good
    expect(judgeOne(100, 100)).toBe('perfect'); // 보정하면 perfect
  });
});

describe('createJudger — 입력 처리 규칙', () => {
  const expected = expectedTapTimes(quarter, 80, 0);

  it('채터링: 60ms 이내 연속 입력의 두 번째는 무시된다', () => {
    const j = createJudger(expected, 0);
    expect(j.tap(expected[0]!)).toBe('perfect');
    expect(j.tap(expected[0]! + ms(30))).toBe('ignored');
    // 60ms를 넘기면 다시 받는다 (다음 기대 탭과는 멀어 추가 탭 처리)
    expect(j.tap(expected[0]! + ms(70))).toBe('extra');
  });

  it('더블 매칭 방지: 같은 기대 탭에 두 입력이 매칭되지 않는다', () => {
    const j = createJudger(expected, 0);
    expect(j.tap(expected[0]! - ms(40))).toBe('perfect');
    // 같은 기대 탭 근처의 두 번째 입력(채터링 범위 밖)은 추가 탭
    expect(j.tap(expected[0]! + ms(40))).toBe('extra');
    expect(j.result('quarter', 80).counts.perfect).toBe(1);
    expect(j.result('quarter', 80).extraTaps).toBe(1);
  });

  it('추가 탭은 정확도 분모에 들어가지 않는다', () => {
    const j = createJudger(expected, 0);
    j.tap(expected[0]!);
    j.tap(expected[0]! + ms(300)); // 어느 기대 탭과도 멀다
    const r = j.result('quarter', 80);
    expect(r.extraTaps).toBe(1);
    expect(r.counts.perfect + r.counts.good + r.counts.miss).toBe(expected.length);
  });
});

describe('createJudger — miss 확정 (§3.8)', () => {
  const expected = expectedTapTimes(quarter, 80, 0);

  it('입력이 없으면 기대 탭이 전부 miss로 집계된다', () => {
    const r = createJudger(expected, 0).result('quarter', 80);
    expect(r.counts.miss).toBe(expected.length);
    expect(r.accuracy).toBe(0);
  });

  it('기대 시각 + good 윈도우가 지나면 세션 종료 전에 miss가 확정된다', () => {
    const j = createJudger(expected, 0);
    expect(j.collectMisses(expected[0]! + ms(119))).toEqual([]); // 아직 대기
    expect(j.collectMisses(expected[0]! + ms(121))).toEqual([0]); // 확정
    expect(j.collectMisses(expected[0]! + ms(121))).toEqual([]); // 재보고 안 함
  });

  it('매칭된 기대 탭은 miss로 확정되지 않는다', () => {
    const j = createJudger(expected, 0);
    j.tap(expected[0]!);
    expect(j.collectMisses(expected[0]! + ms(200))).toEqual([]);
  });
});

describe('createJudger — 정확도 집계 (§3)', () => {
  it('P=12, G=4, M=0, 기대 16 → 87.5%', () => {
    const expected = expectedTapTimes(quarter, 80, 0); // 4마디 × 4탭 = 16
    expect(expected.length).toBe(16);
    const j = createJudger(expected, 0);
    expected.forEach((t, i) => j.tap(t + ms(i < 12 ? 0 : 100)));
    const r = j.result('quarter', 80);
    expect(r.counts).toEqual({ perfect: 12, good: 4, miss: 0 });
    expect(r.accuracy).toBe(87.5);
  });

  it('정확도는 소수 1자리로 반올림한다', () => {
    const expected = expectedTapTimes(quarter, 80, 0);
    const j = createJudger(expected, 0);
    expected.slice(0, 7).forEach((t) => j.tap(t)); // 7/16 = 43.75 → 43.8
    expect(j.result('quarter', 80).accuracy).toBe(43.8);
  });

  it('결과에 패턴·BPM·재생 시각이 담긴다', () => {
    const r = createJudger(expectedTapTimes(quarter, 80, 0), 0).result('quarter', 80);
    expect(r.patternId).toBe('quarter');
    expect(r.bpm).toBe(80);
    expect(Date.parse(r.playedAt)).not.toBeNaN();
  });
});
