import { describe, it, expect } from 'vitest';
import { formatBest } from '../src/ui/list';

describe('formatBest', () => {
  it('기록이 없으면 — 로 표시한다', () => {
    expect(formatBest(null)).toBe('—');
  });

  it('기록이 있으면 퍼센트로 표시한다', () => {
    expect(formatBest(92.5)).toBe('92.5%');
    expect(formatBest(100)).toBe('100%');
    expect(formatBest(0)).toBe('0%'); // 0%는 "기록 없음"이 아니다
  });
});
