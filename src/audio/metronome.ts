// 메트로놈 — Tech Spec §5.
//
// 룩어헤드 패턴: 25ms 타이머로 0.1초 앞을 미리 예약한다. setInterval의 지터가
// 그대로 클릭 타이밍이 되지 않도록, 실제 재생 시각은 AudioContext가 잡는다.
//
// 박 계산(createBeatScheduler)은 Web Audio와 분리해 두었다. 타이밍이 이 앱의
// 핵심이라 브라우저 없이 검증할 수 있어야 한다.
import {
  COUNT_IN_BARS,
  LOOKAHEAD_INTERVAL_MS,
  PLAY_BARS,
  SCHEDULE_AHEAD_S,
} from '../constants';

/** 예약된 박 하나. time은 AudioContext 축(초). */
export interface Beat {
  index: number; // 카운트인 첫 박이 0
  time: number;
  isAccent: boolean;
}

export interface BeatSchedulerOptions {
  startTime: number; // 카운트인 첫 박의 AudioContext 시각
  bpm: number;
  beatsPerBar: number;
  accents: number[]; // 마디 안의 액센트 박 위치
}

/** 카운트인 + 연습 마디를 합한 총 박 수. */
export const totalBeats = (beatsPerBar: number): number =>
  (COUNT_IN_BARS + PLAY_BARS) * beatsPerBar;

/** 마디 안 위치로 액센트 여부를 판정한다. */
export const isAccentBeat = (
  beatIndex: number,
  beatsPerBar: number,
  accents: number[],
): boolean => accents.includes(beatIndex % beatsPerBar);

export interface BeatScheduler {
  /** now 기준 선행 예약 윈도우 안의 아직 안 나온 박들. 같은 박은 한 번만 나온다. */
  pull(now: number): Beat[];
  /** now 시점에 이미 울린 가장 최근 박. 시작 전이면 null. 비트 인디케이터용. */
  beatAt(now: number): Beat | null;
  /** 총 박을 모두 내보냈는지. */
  isDone(): boolean;
}

/**
 * 박 예약 커서. 상태는 "다음에 내보낼 박 번호" 하나뿐이다.
 *
 * 타이머가 늦게 깨어나도 while 루프가 밀린 박을 한 번에 따라잡으므로,
 * 클릭이 누락되지 않는다.
 */
export function createBeatScheduler(
  opts: BeatSchedulerOptions,
): BeatScheduler {
  const { startTime, bpm, beatsPerBar, accents } = opts;
  const secondsPerBeat = 60 / bpm;
  const total = totalBeats(beatsPerBar);

  const beatAtIndex = (index: number): Beat => ({
    index,
    time: startTime + index * secondsPerBeat,
    isAccent: isAccentBeat(index, beatsPerBar, accents),
  });

  let nextIndex = 0;

  return {
    pull(now) {
      const until = now + SCHEDULE_AHEAD_S;
      const beats: Beat[] = [];
      while (nextIndex < total) {
        const beat = beatAtIndex(nextIndex);
        if (beat.time >= until) break;
        beats.push(beat);
        nextIndex++;
      }
      return beats;
    },

    beatAt(now) {
      const elapsed = now - startTime;
      if (elapsed < 0) return null;
      const index = Math.min(Math.floor(elapsed / secondsPerBeat), total - 1);
      return beatAtIndex(index);
    },

    isDone: () => nextIndex >= total,
  };
}

/** 클릭음 주파수 — 액센트를 높게 잡아 마디 시작이 귀에 들어오게 한다. */
const ACCENT_HZ = 1000;
const NORMAL_HZ = 800;
const CLICK_SECONDS = 0.05;

/**
 * 클릭 1회를 예약한다. 오디오 파일 없이 OscillatorNode로 합성한다.
 *
 * gain을 순간적으로 끊지 않고 지수적으로 감쇠시키는 이유는, 급격한 진폭 변화가
 * 클릭 노이즈(팝)를 만들기 때문이다.
 */
export function scheduleClick(
  ctx: AudioContext,
  time: number,
  isAccent: boolean,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.frequency.value = isAccent ? ACCENT_HZ : NORMAL_HZ;
  gain.gain.setValueAtTime(1, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + CLICK_SECONDS);

  osc.connect(gain).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + CLICK_SECONDS);
}

export interface Metronome {
  /** 카운트인 첫 박의 AudioContext 시각. 판정의 기준점이 된다. */
  readonly startTime: number;
  /** now 시점에 울린 가장 최근 박. 비트 인디케이터용. */
  beatAt(now: number): Beat | null;
  stop(): void;
}

export interface MetronomeOptions extends Omit<BeatSchedulerOptions, 'startTime'> {
  ctx: AudioContext;
  /** 마지막 박까지 예약을 마치면 호출된다(재생 완료가 아니라 예약 완료). */
  onScheduled?: () => void;
}

/**
 * 메트로놈을 시작한다. 호출 전에 사용자 제스처로 ctx.resume()이 끝나 있어야 한다
 * (iOS 자동재생 정책).
 *
 * 첫 박을 살짝 뒤에 잡는 이유는, 지금 당장으로 잡으면 첫 클릭이 예약 윈도우를
 * 이미 지나쳐 누락되기 때문이다.
 */
export function startMetronome(opts: MetronomeOptions): Metronome {
  const { ctx, onScheduled, ...rest } = opts;
  const startTime = ctx.currentTime + SCHEDULE_AHEAD_S;
  const scheduler = createBeatScheduler({ ...rest, startTime });

  const timer = setInterval(() => {
    for (const beat of scheduler.pull(ctx.currentTime)) {
      scheduleClick(ctx, beat.time, beat.isAccent);
    }
    if (scheduler.isDone()) {
      clearInterval(timer);
      onScheduled?.();
    }
  }, LOOKAHEAD_INTERVAL_MS);

  return {
    startTime,
    beatAt: (now) => scheduler.beatAt(now),
    stop: () => clearInterval(timer),
  };
}
