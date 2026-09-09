import { describe, it, expect } from 'vitest';
import { formatBest } from '../src/ui/list';
import { FEEDBACK_URL } from '../src/constants';

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

describe('FEEDBACK_URL', () => {
  // 창구가 없으면 앱이 특정 기기에서 깨져 있어도 알아낼 경로가 없다.
  // 주소가 실수로 비거나 상대 경로가 되면 링크가 조용히 죽으므로 형태만 고정한다.
  it('외부로 나가는 절대 주소다', () => {
    expect(FEEDBACK_URL).toMatch(/^https:\/\//);
  });
});
