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

  // 첫 기대 탭은 카운트인 경계와 맞닿아 있어, 순수한 매칭 경계는 중간 탭에서 본다
  const TARGET = 4;
  const judgeOne = (deltaMs: number, offsetMs = 0) => {
    const j = createJudger(expected, offsetMs);
    return j.tap(expected[TARGET]! + ms(deltaMs));
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
    expect(j.tap(expected[0]! + ms(100))).toBe('extra');
  });

  it('정확히 60ms 간격도 무시한다 — PRD §5는 "60ms 이내"', () => {
    const j = createJudger(expected, 0);
    expect(j.tap(expected[0]!)).toBe('perfect');
    expect(j.tap(expected[0]! + ms(60))).toBe('ignored');
  });

  it('채터링 기준은 채택 여부와 무관하게 직전 입력이다 (바운스 연쇄)', () => {
    const j = createJudger(expected, 0);
    expect(j.tap(expected[0]! + ms(300))).toBe('extra');
    expect(j.tap(expected[0]! + ms(359))).toBe('ignored'); // 직전과 59ms
    expect(j.tap(expected[0]! + ms(400))).toBe('ignored'); // 무시된 입력과 41ms
  });

  it('카운트인 구간의 입력은 판정하지 않는다 (PRD §5)', () => {
    const j = createJudger(expected, 0);
    expect(j.tap(expected[0]! - ms(500))).toBe('ignored');
    // 추가 탭으로도 세지 않는다
    expect(j.result('quarter', 80).extraTaps).toBe(0);
  });

  it('카운트인 탭이 바로 뒤의 정상 탭을 삼키지 않는다', () => {
    const j = createJudger(expected, 0);
    // 카운트인 끝자락(첫 창이 열리기 직전)에 한 번, 곧바로 정상 탭
    expect(j.tap(expected[0]! - ms(130))).toBe('ignored'); // 카운트인 구간
    expect(j.tap(expected[0]!)).toBe('perfect'); // 채터링으로 삼켜지면 안 된다
  });

  it('첫 기대 탭을 살짝 앞서 치는 입력은 정상 판정한다', () => {
    expect(createJudger(expected, 0).tap(expected[0]! - ms(40))).toBe('perfect');
    expect(createJudger(expected, 0).tap(expected[0]! - ms(110))).toBe('good');
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

  it('지연 보정이 miss 마감 시점에도 반영된다', () => {
    const j = createJudger(expected, 200); // offset +200ms
    // raw 축의 유효 창은 expected + 200ms를 중심으로 ±120ms → 마감은 +320ms
    expect(j.collectMisses(expected[0]! + ms(200))).toEqual([]);
    expect(j.collectMisses(expected[0]! + ms(319))).toEqual([]);
    expect(j.collectMisses(expected[0]! + ms(321))).toEqual([0]);
  });

  it('보정 후 제때 들어온 탭은 miss로 확정되지 않는다', () => {
    const j = createJudger(expected, 200);
    expect(j.tap(expected[0]! + ms(200))).toBe('perfect'); // 보정하면 오차 0
    expect(j.collectMisses(expected[0]! + ms(400))).toEqual([]);
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
    const j = createJudger(expectedTapTimes(quarter, 80, 0), 0);
    expect(Date.parse(j.result('quarter', 80).playedAt)).not.toBeNaN(); // 기본값
    const r = j.result('quarter', 80, '2026-09-09T00:00:00.000Z'); // 주입 가능
    expect(r).toMatchObject({
      patternId: 'quarter',
      bpm: 80,
      playedAt: '2026-09-09T00:00:00.000Z',
    });
  });
});

describe('createJudger — 판정 시작 시각', () => {
  const expected = expectedTapTimes(quarter, 80, 0);

  it('첫 기대 탭의 허용 창이 열리는 시각이다', () => {
    expect(createJudger(expected, 0).acceptsFrom).toBeCloseTo(expected[0]! - 0.12, 10);
  });

  it('지연 보정만큼 뒤로 밀린다', () => {
    expect(createJudger(expected, 200).acceptsFrom).toBeCloseTo(expected[0]! + 0.08, 10);
  });

  it('이 시각 전후로 판정 여부가 갈린다', () => {
    const judger = createJudger(expected, 0);
    // 경계 직전은 카운트인이라 무시, 직후는 판정 대상
    expect(judger.tap(createJudger(expected, 0).acceptsFrom - 0.001)).toBe('ignored');
    expect(createJudger(expected, 0).tap(expected[0]! - 0.119)).toBe('good');
  });
});

describe('createJudger — 판정 확정 시각', () => {
  const expected = expectedTapTimes(quarter, 80, 0);

  it('마지막 기대 탭의 허용 창이 닫히는 시각', () => {
    const last = expected[expected.length - 1]!;
    expect(createJudger(expected, 0).settledAt).toBeCloseTo(last + 0.12, 10);
  });

  it('지연 보정만큼 뒤로 밀린다', () => {
    const last = expected[expected.length - 1]!;
    expect(createJudger(expected, 200).settledAt).toBeCloseTo(last + 0.32, 10);
  });

  it('120BPM eighth-mix + 보정 200ms면 마디 끝보다 늦게 확정된다', () => {
    const mix = PATTERNS.find((p) => p.id === 'eighth-mix')!;
    const exp = expectedTapTimes(mix, 120, 0);
    const barEnd = (COUNT_IN_BARS + PLAY_BARS) * 4 * (60 / 120); // 10초
    expect(createJudger(exp, 200).settledAt).toBeGreaterThan(barEnd);
    expect(createJudger(exp, 0).settledAt).toBeLessThan(barEnd);
  });
});

describe('createJudger — 기대 탭별 판정 기록 (Tech Spec §2 TapJudgment)', () => {
  const expected = expectedTapTimes(quarter, 80, 0);

  it('기대 탭 수만큼 기록을 만들고, 입력 전에는 전부 미입력 miss다', () => {
    const records = createJudger(expected, 0).judgments();
    expect(records).toHaveLength(expected.length);
    expect(records[0]).toEqual({
      expectedTime: expected[0],
      tapTime: null,
      deltaMs: null,
      verdict: 'miss',
    });
  });

  it('매칭된 탭의 시각과 오차를 남긴다', () => {
    const j = createJudger(expected, 0);
    j.tap(expected[0]! + ms(30));

    expect(j.judgments()[0]).toEqual({
      expectedTime: expected[0],
      tapTime: expected[0]! + ms(30),
      deltaMs: expect.closeTo(30, 6),
      verdict: 'perfect',
    });
  });

  it('늦은 탭은 양수, 이른 탭은 음수 오차다', () => {
    const late = createJudger(expected, 0);
    late.tap(expected[0]! + ms(80));
    expect(late.judgments()[0]!.deltaMs).toBeCloseTo(80, 6);

    const early = createJudger(expected, 0);
    early.tap(expected[0]! - ms(80));
    expect(early.judgments()[0]!.deltaMs).toBeCloseTo(-80, 6);
  });

  it('tapTime은 실제 입력 시각, deltaMs는 지연 보정 후 오차다 (사양 §5)', () => {
    // 보정 +100ms 기기에서 100ms 늦게 친 탭 = 실제로는 정확히 맞춘 것
    const j = createJudger(expected, 100);
    const rawTime = expected[0]! + ms(100);
    j.tap(rawTime);

    const record = j.judgments()[0]!;
    expect(record.tapTime).toBe(rawTime); // 보정 전 = 사용자가 실제로 친 시각
    expect(record.deltaMs).toBeCloseTo(0, 6); // 보정 후 = 판정에 쓰인 오차
    expect(record.verdict).toBe('perfect');
  });

  it('집계는 기록에서 파생된다 — 두 값이 어긋날 수 없다', () => {
    const j = createJudger(expected, 0);
    expected.forEach((t, i) => {
      if (i < 12) j.tap(t); // perfect
      else if (i < 14) j.tap(t + ms(100)); // good
      // 나머지 2개는 입력하지 않는다 → miss
    });

    const records = j.judgments();
    const counted = {
      perfect: records.filter((r) => r.verdict === 'perfect').length,
      good: records.filter((r) => r.verdict === 'good').length,
      miss: records.filter((r) => r.verdict === 'miss').length,
    };
    expect(j.result('quarter', 80).counts).toEqual(counted);
    expect(counted).toEqual({ perfect: 12, good: 2, miss: 2 });
  });

  it('돌려준 기록을 고쳐도 판정기 내부는 바뀌지 않는다', () => {
    const j = createJudger(expected, 0);
    j.tap(expected[0]!);

    const stolen = j.judgments();
    stolen[0]!.verdict = 'miss';
    stolen[1]!.tapTime = 999;

    expect(j.judgments()[0]!.verdict).toBe('perfect');
    expect(j.result('quarter', 80).counts.perfect).toBe(1);
  });
});
