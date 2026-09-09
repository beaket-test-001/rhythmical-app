import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createBeatScheduler,
  isAccentBeat,
  startMetronome,
  totalBeats,
} from '../src/audio/metronome';
import { PATTERNS } from '../src/core/patterns';
import {
  COUNT_IN_BARS,
  LOOKAHEAD_INTERVAL_MS,
  PLAY_BARS,
  SCHEDULE_AHEAD_S,
} from '../src/constants';

describe('isAccentBeat', () => {
  it('마디 첫 박이 액센트다 (기본 accents [0])', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => isAccentBeat(i, 4, [0]))).toEqual([
      true, false, false, false, true, false,
    ]);
  });

  it('액센트 위치는 마디 안의 박 번호로 해석한다', () => {
    expect(isAccentBeat(6, 4, [2])).toBe(true); // 두 번째 마디의 3번째 박
    expect(isAccentBeat(5, 4, [2])).toBe(false);
  });
});

describe('totalBeats', () => {
  it('카운트인 + 연습 마디의 총 박 수', () => {
    expect(totalBeats(4)).toBe((COUNT_IN_BARS + PLAY_BARS) * 4); // 20
  });
});

describe('createBeatScheduler — 룩어헤드 (§5)', () => {
  const opts = { startTime: 10, bpm: 60, beatsPerBar: 4, accents: [0] }; // 1박 = 1초

  it('선행 예약 윈도우 안의 박만 내보낸다', () => {
    const s = createBeatScheduler(opts);
    // now=10 → 10.1초 앞까지 예약 → 첫 박(10초)만 해당
    expect(s.pull(10).map((b) => b.time)).toEqual([10]);
    expect(s.pull(10)).toEqual([]); // 같은 박을 두 번 내보내지 않는다
    expect(s.pull(10.5)).toEqual([]); // 다음 박(11초)은 아직 윈도우 밖
    expect(s.pull(11).map((b) => b.time)).toEqual([11]);
  });

  it('타이머가 늦게 깨어나면 밀린 박을 한 번에 따라잡는다', () => {
    const s = createBeatScheduler(opts);
    const beats = s.pull(13); // 10 ~ 13.1초 구간
    expect(beats.map((b) => b.time)).toEqual([10, 11, 12, 13]);
    expect(beats.map((b) => b.index)).toEqual([0, 1, 2, 3]);
  });

  it('BPM이 박 간격에 반영된다', () => {
    const s = createBeatScheduler({ ...opts, bpm: 120 }); // 1박 = 0.5초
    expect(s.pull(11).map((b) => b.time)).toEqual([10, 10.5, 11]);
  });

  it('액센트 정보가 박에 함께 실린다', () => {
    const s = createBeatScheduler(opts);
    expect(s.pull(14).map((b) => b.isAccent)).toEqual([
      true, false, false, false, true,
    ]);
  });

  it('총 박 수를 넘어서면 더 내보내지 않는다', () => {
    const s = createBeatScheduler(opts); // 20박, 60BPM → 마지막 박 29초
    expect(s.pull(100).length).toBe(20);
    expect(s.pull(200)).toEqual([]);
    expect(s.isDone()).toBe(true);
  });

  it('선행 예약 윈도우는 상수를 따른다', () => {
    const s = createBeatScheduler({ ...opts, startTime: 0 });
    // 첫 박은 0초. now가 -SCHEDULE_AHEAD_S 직전이면 아직 안 나온다
    expect(s.pull(-SCHEDULE_AHEAD_S - 0.001)).toEqual([]);
    expect(s.pull(-SCHEDULE_AHEAD_S + 0.001).map((b) => b.time)).toEqual([0]);
  });
});

describe('createBeatScheduler — 시각 표시용 조회', () => {
  const opts = { startTime: 0, bpm: 60, beatsPerBar: 4, accents: [0] };

  it('now 시점에 울린 가장 최근 박을 돌려준다', () => {
    const s = createBeatScheduler(opts);
    s.pull(100); // 전 구간 예약
    expect(s.beatAt(-0.5)).toBeNull(); // 시작 전
    expect(s.beatAt(0)!.index).toBe(0);
    expect(s.beatAt(2.7)!.index).toBe(2);
    expect(s.beatAt(19)!.index).toBe(19); // 마지막 박
    expect(s.beatAt(19.9)!.index).toBe(19); // 마지막 마디가 아직 안 끝났다
    expect(s.beatAt(20)).toBeNull(); // 마지막 마디 종료
    expect(s.beatAt(100)).toBeNull();
  });

  it('마지막 마디의 끝 시각을 알려준다', () => {
    // 20박 × 1초. 마지막 클릭(19초)이 아니라 마디가 끝나는 20초여야 한다.
    expect(createBeatScheduler(opts).endTime).toBe(20);
  });

  it('마지막 기대 탭이 마지막 클릭보다 뒤에 오는 패턴이 있다', () => {
    // eighth-mix의 마지막 탭은 마디 3의 3.5박 → 카운트인 포함 19.5박.
    // 마지막 클릭(19박)보다 늦으므로 종료 기준은 endTime이어야 한다.
    const mix = PATTERNS.find((p) => p.id === 'eighth-mix')!;
    const lastTap = 4 + 3 * 4 + mix.taps[mix.taps.length - 1]!;
    expect(lastTap).toBe(19.5);
    expect(lastTap).toBeGreaterThan(totalBeats(4) - 1);
    expect(lastTap).toBeLessThan(totalBeats(4));
  });
});

describe('startMetronome — 타이머 생명주기', () => {
  afterEach(() => vi.useRealTimers());

  /**
   * Web Audio 없이 예약만 관찰하는 최소 스텁.
   * AudioContext 시각과 타이머를 함께 진행시켜야 실제 동작과 같아진다.
   */
  function stubContext() {
    const started: number[] = [];
    let disconnected = false;
    let now = 0;

    const pass = (to: unknown) => to;
    const ctx = {
      get currentTime() {
        return now;
      },
      destination: {},
      createGain: () => ({
        connect: pass,
        disconnect: () => {
          disconnected = true;
        },
        gain: {
          setValueAtTime: () => void 0,
          exponentialRampToValueAtTime: () => void 0,
        },
      }),
      createOscillator: () => ({
        frequency: { value: 0 },
        connect: pass,
        start: (t: number) => void started.push(t),
        stop: () => void 0,
      }),
    } as unknown as AudioContext;

    return {
      ctx,
      started,
      isDisconnected: () => disconnected,
      /** 오디오 시각과 타이머를 25ms 단위로 함께 진행시킨다. */
      run(seconds: number) {
        const steps = Math.round((seconds * 1000) / LOOKAHEAD_INTERVAL_MS);
        for (let i = 0; i < steps; i++) {
          now += LOOKAHEAD_INTERVAL_MS / 1000;
          vi.advanceTimersByTime(LOOKAHEAD_INTERVAL_MS);
        }
      },
      /** 타이머는 멈춘 채 오디오 시각만 건너뛴다 — 백그라운드 탭 스로틀. */
      skip: (seconds: number) => void (now += seconds),
    };
  }

  const quarter = PATTERNS.find((p) => p.id === 'quarter')!;

  it('첫 클릭은 타이머를 기다리지 않고 즉시 예약된다', () => {
    vi.useFakeTimers();
    const { ctx, started } = stubContext();
    const m = startMetronome({ ctx, pattern: quarter, bpm: 60 });
    expect(started).toEqual([m.startTime]);
    m.stop();
  });

  it('예약된 클릭 시각이 기대 박 격자와 일치한다', () => {
    vi.useFakeTimers();
    const { ctx, started, run } = stubContext();
    const m = startMetronome({ ctx, pattern: quarter, bpm: 60 });
    run(3);
    expect(started.slice(0, 4)).toEqual([
      m.startTime,
      m.startTime + 1,
      m.startTime + 2,
      m.startTime + 3,
    ]);
    m.stop();
  });

  it('모든 박 예약이 끝나면 타이머를 정리한다', () => {
    vi.useFakeTimers();
    const { ctx, started, run } = stubContext();
    startMetronome({ ctx, pattern: quarter, bpm: 60 });
    run(25); // 20박(20초)보다 넉넉히
    expect(started).toHaveLength(totalBeats(4));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('중지하면 타이머와 예약된 클릭을 모두 끊는다', () => {
    vi.useFakeTimers();
    const { ctx, started, run, isDisconnected } = stubContext();
    const m = startMetronome({ ctx, pattern: quarter, bpm: 60 });
    run(2);
    const count = started.length;

    m.stop();
    expect(isDisconnected()).toBe(true); // 예약이 끝난 클릭도 소리로 나가지 않는다
    expect(vi.getTimerCount()).toBe(0);

    run(5);
    expect(started).toHaveLength(count); // 중지 후 추가 예약 없음
  });

  it('이미 지난 박은 예약하지 않는다 (백그라운드 탭 스로틀)', () => {
    vi.useFakeTimers();
    const { ctx, started, run, skip } = stubContext();
    startMetronome({ ctx, pattern: quarter, bpm: 60 });
    const before = started.length;

    skip(10); // 탭이 백그라운드에 있던 10초 — 타이머는 안 돌았다
    run(0.025); // 돌아온 뒤 첫 tick

    // 밀린 박을 과거 시각으로 예약하면 전부 동시에 울린다
    expect(started.slice(before).every((t) => t >= 10)).toBe(true);
  });
});
