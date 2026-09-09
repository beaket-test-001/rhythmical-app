import { describe, it, expect, vi, afterEach } from 'vitest';
import { track } from '../src/analytics';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('track', () => {
  it('로컬 개발 환경에서는 전송하지 않는다', () => {
    const va = vi.fn();
    vi.stubEnv('DEV', true);
    vi.stubGlobal('window', { va });
    track('retry', { pattern_id: 'quarter' });
    expect(va).not.toHaveBeenCalled();
  });

  it('이벤트 이름과 속성을 한 페이로드로 보낸다', () => {
    const va = vi.fn();
    vi.stubEnv('DEV', false);
    vi.stubGlobal('window', { va });
    track('practice_start', { pattern_id: 'quarter', bpm: 80 });
    expect(va).toHaveBeenCalledWith('event', {
      name: 'practice_start',
      pattern_id: 'quarter',
      bpm: 80,
    });
  });

  it('계측 도구가 없어도 조용히 넘어간다', () => {
    vi.stubEnv('DEV', false);
    vi.stubGlobal('window', {}); // 스크립트가 로드되지 않은 환경
    expect(() => track('retry', { pattern_id: 'quarter' })).not.toThrow();
  });

  it('계측 도구가 던져도 앱으로 예외가 새지 않는다', () => {
    vi.stubEnv('DEV', false);
    vi.stubGlobal('window', {
      va: () => {
        throw new Error('전송 실패');
      },
    });
    // fire-and-forget 보증: 계측 실패가 연습을 막아서는 안 된다
    expect(() => track('practice_complete', { accuracy: 87.5 })).not.toThrow();
  });
});
