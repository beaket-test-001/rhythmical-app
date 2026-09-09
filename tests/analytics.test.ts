import { describe, it, expect } from 'vitest';
import { track, type TrackEvent } from '../src/analytics';

const EVENTS: TrackEvent[] = [
  'practice_start',
  'practice_complete',
  'practice_abort',
  'retry',
  'offset_changed',
];

describe('track', () => {
  // v0.1에서는 no-op이지만, 이 계약은 도구를 붙인 뒤에도 지켜져야 한다.
  // 계측 실패가 연습을 막으면 안 되기 때문이다(Analytics 문서 fire-and-forget).
  it('어떤 이벤트에도 예외를 던지지 않는다', () => {
    for (const name of EVENTS) {
      expect(() => track(name, { pattern_id: 'quarter', bpm: 80 })).not.toThrow();
    }
  });

  it('속성 없이도 호출할 수 있다', () => {
    expect(() => track('retry')).not.toThrow();
  });
});
