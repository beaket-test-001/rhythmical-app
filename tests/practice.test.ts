import { describe, it, expect, vi, afterEach } from 'vitest';
import { inputTime, startSession } from '../src/ui/practice';
import { PATTERNS } from '../src/core/patterns';
import { COUNT_IN_BARS, PLAY_BARS, SCHEDULE_AHEAD_S } from '../src/constants';

/** 메트로놈이 첫 박에 두는 여유 — startMetronome과 같은 규칙. */
const START_LEAD = SCHEDULE_AHEAD_S / 2;

const quarter = PATTERNS.find((p) => p.id === 'quarter')!;

/** Web Audio 없이 도는 최소 스텁. 시각을 직접 밀어 세션을 진행시킨다. */
function stubContext() {
  let now = 0;
  const pass = (to: unknown) => to;
  const ctx = {
    get currentTime() {
      return now;
    },
    destination: {},
    createGain: () => ({
      connect: pass,
      disconnect: () => void 0,
      gain: {
        setValueAtTime: () => void 0,
        exponentialRampToValueAtTime: () => void 0,
      },
    }),
    createOscillator: () => ({
      frequency: { value: 0 },
      connect: pass,
      start: () => void 0,
      stop: () => void 0,
    }),
  } as unknown as AudioContext;
  return { ctx, seek: (t: number) => void (now = t) };
}

/** AudioContext 시각을 performance.now() 축(ms)으로. 세션의 anchor와 짝을 이룬다. */
const toPerf = (audioTime: number, anchorPerf: number, anchorAudio = 0) =>
  anchorPerf + (audioTime - anchorAudio) * 1000;

afterEach(() => vi.useRealTimers());

describe('startSession — 진행 단계', () => {
  const setup = (bpm = 60) => {
    vi.useFakeTimers();
    const { ctx, seek } = stubContext();
    const session = startSession({ ctx, pattern: quarter, bpm, offsetMs: 0 });
    return { session, seek };
  };

  it('카운트인 동안 4 → 1로 세어 내려간다', () => {
    const { session, seek } = setup();
    const start = START_LEAD;

    seek(start);
    expect(session.poll(start)).toMatchObject({ phase: 'countIn', countdown: 4 });
    seek(start + 1);
    expect(session.poll(start + 1)).toMatchObject({ phase: 'countIn', countdown: 3 });
    seek(start + 3);
    expect(session.poll(start + 3)).toMatchObject({ phase: 'countIn', countdown: 1 });
    session.stop();
  });

  it('카운트인은 마디 경계가 아니라 판정이 시작되는 시각에 끝난다', () => {
    // 첫 기대 탭의 허용 창(±120ms)은 마디 경계보다 조금 먼저 열린다.
    // 그 사이의 탭은 정상 판정되므로 화면도 이때 연습 구간으로 넘어가야 한다.
    const { session, seek } = setup();
    const playStart = START_LEAD + COUNT_IN_BARS * 4;
    const acceptsFrom = playStart - 0.12;

    seek(acceptsFrom - 0.01);
    expect(session.poll(acceptsFrom - 0.01).phase).toBe('countIn');
    seek(acceptsFrom + 0.01);
    expect(session.poll(acceptsFrom + 0.01)).toMatchObject({
      phase: 'playing',
      countdown: null,
    });
    session.stop();
  });

  it('마지막 마디가 끝나면 종료로 넘어간다', () => {
    const { session, seek } = setup();
    const end = START_LEAD + (COUNT_IN_BARS + PLAY_BARS) * 4; // 20박 × 1초

    seek(end - 0.01);
    expect(session.poll(end - 0.01).phase).toBe('playing');
    seek(end);
    expect(session.poll(end).phase).toBe('finished');
    session.stop();
  });

  it('지연 보정이 크면 마디가 끝나도 판정 창이 닫힐 때까지 기다린다', () => {
    vi.useFakeTimers();
    const { ctx, seek } = stubContext();
    const mix = PATTERNS.find((p) => p.id === 'eighth-mix')!;
    const session = startSession({ ctx, pattern: mix, bpm: 120, offsetMs: 200 });
    const barEnd = START_LEAD + (COUNT_IN_BARS + PLAY_BARS) * 4 * 0.5; // 10.05초

    seek(barEnd);
    expect(session.poll(barEnd).phase).not.toBe('finished');
    seek(barEnd + 0.5);
    expect(session.poll(barEnd + 0.5).phase).toBe('finished');
    session.stop();
  });

  it('현재 박을 마디 안 위치로 알려준다', () => {
    const { session, seek } = setup();
    seek(START_LEAD);
    expect(session.poll(START_LEAD).beat).toMatchObject({ index: 0, isAccent: true });
    seek(START_LEAD + 5);
    expect(session.poll(START_LEAD + 5).beat).toMatchObject({ index: 5, isAccent: false });
    session.stop();
  });
});

describe('startSession — 탭 입력과 시간 축 변환', () => {
  it('performance.now() 축의 입력을 AudioContext 축으로 옮겨 판정한다', () => {
    vi.useFakeTimers();
    const { ctx, seek } = stubContext();
    const anchorPerf = performance.now();
    const session = startSession({ ctx, pattern: quarter, bpm: 60, offsetMs: 0 });

    // 첫 기대 탭 = 카운트인 4박 뒤 = 0.05 + 4 = 4.05초 (AudioContext 축)
    const firstExpected = START_LEAD + COUNT_IN_BARS * 4;
    seek(firstExpected);

    expect(session.tap(toPerf(firstExpected, anchorPerf))).toBe('perfect');
    expect(session.result().counts.perfect).toBe(1);
    session.stop();
  });

  it('카운트인 중 입력은 판정하지 않는다', () => {
    vi.useFakeTimers();
    const { ctx } = stubContext();
    const anchorPerf = performance.now();
    const session = startSession({ ctx, pattern: quarter, bpm: 60, offsetMs: 0 });

    expect(session.tap(toPerf(1.0, anchorPerf))).toBe('ignored');
    expect(session.result().extraTaps).toBe(0);
    session.stop();
  });

  it('지연 보정이 판정에 반영된다', () => {
    vi.useFakeTimers();
    const { ctx } = stubContext();
    const anchorPerf = performance.now();
    const session = startSession({ ctx, pattern: quarter, bpm: 60, offsetMs: 100 });

    // 100ms 늦게 친 탭이 보정으로 정확해진다
    const firstExpected = START_LEAD + COUNT_IN_BARS * 4;
    expect(session.tap(toPerf(firstExpected + 0.1, anchorPerf))).toBe('perfect');
    session.stop();
  });
});

describe('startSession — miss 확정', () => {
  it('입력하지 않은 기대 탭은 프레임 폴링 중에 miss로 확정된다', () => {
    vi.useFakeTimers();
    const { ctx, seek } = stubContext();
    const session = startSession({ ctx, pattern: quarter, bpm: 60, offsetMs: 0 });
    const firstExpected = START_LEAD + COUNT_IN_BARS * 4;

    seek(firstExpected + 0.1);
    expect(session.poll(firstExpected + 0.1).newMisses).toBe(0); // 아직 창 안
    seek(firstExpected + 0.13);
    expect(session.poll(firstExpected + 0.13).newMisses).toBe(1); // 창이 닫혔다
    expect(session.poll(firstExpected + 0.13).newMisses).toBe(0); // 재보고 없음
    session.stop();
  });

  it('한 번도 치지 않으면 전부 miss로 집계된다', () => {
    vi.useFakeTimers();
    const { ctx, seek } = stubContext();
    const session = startSession({ ctx, pattern: quarter, bpm: 60, offsetMs: 0 });
    const end = START_LEAD + (COUNT_IN_BARS + PLAY_BARS) * 4;

    seek(end);
    session.poll(end);
    const result = session.result();
    expect(result.counts).toEqual({ perfect: 0, good: 0, miss: 16 });
    expect(result.accuracy).toBe(0);
    session.stop();
  });
});

describe('inputTime — 입력 시각의 시계 축 방어', () => {
  // 판정은 performance.now() 축으로 만든 anchor에 의존한다. event.timeStamp가
  // 다른 축이면 모든 탭이 판정 창 밖으로 나가 정확도가 0%가 되는데, 에러가
  // 나지 않아 화면상으로는 멀쩡해 보인다. 실기기 검증을 보류한 상태라
  // 이 실패 모드는 코드에서 막아 둔다.
  it('같은 축의 값은 그대로 쓴다', () => {
    expect(inputTime(12_345.6, 12_345.6)).toBe(12_345.6);
  });

  it('이벤트 디스패치 지연 정도는 허용한다', () => {
    // 메인 스레드가 밀려 핸들러 진입이 늦어도 timeStamp가 더 정확하다
    expect(inputTime(10_000, 10_180)).toBe(10_000);
  });

  it('epoch 기준 timeStamp는 버리고 현재 시각을 쓴다', () => {
    // 일부 WebKit 버전이 주는 값. 그대로 쓰면 anchor 변환이 통째로 어긋난다
    const epochLike = 1_757_000_000_000;
    expect(inputTime(epochLike, 12_345.6)).toBe(12_345.6);
  });

  it('값이 없는 합성 이벤트는 현재 시각을 쓴다', () => {
    expect(inputTime(0, 12_345.6)).toBe(12_345.6);
  });

  it('페이지 로드 직후에도 0을 시각으로 쓰지 않는다', () => {
    // now가 작아 차이가 허용 범위 안이더라도 0은 유효한 입력 시각이 아니다
    expect(inputTime(0, 40)).toBe(40);
  });
});
