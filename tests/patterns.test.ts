import { describe, it, expect } from 'vitest';
import { PATTERNS } from '../src/core/patterns';

// 패턴 데이터는 정적이지만 판정 로직(동적 윈도우)이 taps의 정렬·범위에
// 의존하므로, 그 입력 계약만 검증한다.
describe('PATTERNS', () => {
  it('사양서의 패턴 5종이 정의되어 있다', () => {
    expect(PATTERNS.map((p) => p.id)).toEqual([
      'quarter',
      'eighth',
      'triplet',
      'syncopation',
      'eighth-mix',
    ]);
  });

  it('모든 패턴의 탭 위치는 오름차순이며 한 마디 범위 안에 있다', () => {
    for (const p of PATTERNS) {
      const beatsPerBar = p.timeSignature[0];
      expect(p.taps.length).toBeGreaterThan(0);
      for (let i = 0; i < p.taps.length; i++) {
        expect(p.taps[i]!).toBeGreaterThanOrEqual(0);
        expect(p.taps[i]!).toBeLessThan(beatsPerBar);
        if (i > 0) expect(p.taps[i]!).toBeGreaterThan(p.taps[i - 1]!);
      }
    }
  });

  it('BPM 기본값은 패턴별 허용 범위 안에 있다', () => {
    for (const p of PATTERNS) {
      expect(p.bpmMin).toBeLessThanOrEqual(p.bpmDefault);
      expect(p.bpmDefault).toBeLessThanOrEqual(p.bpmMax);
    }
  });

  it('셋잇단은 판정 간격 확보를 위해 상한 100 BPM이다', () => {
    const triplet = PATTERNS.find((p) => p.id === 'triplet')!;
    expect(triplet.bpmMax).toBe(100);
    expect(triplet.taps.length).toBe(12); // 4박 × 3연음
  });
});
