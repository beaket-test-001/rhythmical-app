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
import type { Pattern } from '../types';

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
  /**
   * 마지막 마디가 끝나는 시각. 마지막 '클릭'(index total-1)보다 1박 뒤다.
   *
   * 패턴에 따라 마지막 기대 탭이 마지막 클릭보다 뒤에 온다. eighth-mix는
   * 마지막 탭이 마디 3의 3.5박이라 마지막 클릭보다 반 박 늦다. 이 시각을
   * 기준으로 삼아야 결과 화면이 일찍 전환되지 않는다 (Tech Spec §3 종료 집계).
   */
  readonly endTime: number;
  /** now 기준 선행 예약 윈도우 안의 아직 안 나온 박들. 같은 박은 한 번만 나온다. */
  pull(now: number): Beat[];
  /** now 시점에 울리고 있는 박. 시작 전이거나 끝난 뒤면 null. 비트 인디케이터용. */
  beatAt(now: number): Beat | null;
  /** 총 박을 모두 내보냈는지(예약 기준). 재생 완료와는 다르다. */
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
    endTime: startTime + total * secondsPerBeat,

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
      if (elapsed < 0 || elapsed >= total * secondsPerBeat) return null;
      return beatAtIndex(Math.floor(elapsed / secondsPerBeat));
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
function scheduleClick(
  ctx: AudioContext,
  destination: AudioNode,
  time: number,
  isAccent: boolean,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.frequency.value = isAccent ? ACCENT_HZ : NORMAL_HZ;
  gain.gain.setValueAtTime(1, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + CLICK_SECONDS);

  osc.connect(gain).connect(destination);
  osc.start(time);
  osc.stop(time + CLICK_SECONDS);
}

export interface Metronome {
  /** 카운트인 첫 박의 AudioContext 시각. 판정의 기준점이 된다. */
  readonly startTime: number;
  /** 마지막 마디가 끝나는 시각. 결과 화면 전환 시점의 기준이다. */
  readonly endTime: number;
  /** now 시점에 울리고 있는 박. 비트 인디케이터용. */
  beatAt(now: number): Beat | null;
  /** 즉시 중지. 이미 예약된 클릭도 함께 끊는다. */
  stop(): void;
}

export interface MetronomeOptions {
  ctx: AudioContext;
  pattern: Pattern;
  bpm: number;
}

/**
 * 메트로놈을 시작한다. 호출 전에 사용자 제스처로 ctx.resume()이 끝나 있어야 한다
 * (iOS 자동재생 정책).
 *
 * 첫 박은 지금이 아니라 약간 뒤에 잡는다. 지금 당장으로 잡으면 예약과 재생
 * 사이에 여유가 없어 첫 클릭이 누락된다.
 */
export function startMetronome({ ctx, pattern, bpm }: MetronomeOptions): Metronome {
  // 첫 박의 리드를 예약 윈도우의 절반으로 둔다. 윈도우와 같게 잡으면 첫 박이
  // 경계 밖이라 첫 tick이 잡지 못하고, 타이머가 밀리면 첫 클릭을 통째로
  // 놓치면서 startTime만 남아 판정 기준점이 어긋난다.
  const startTime = ctx.currentTime + SCHEDULE_AHEAD_S / 2;
  const scheduler = createBeatScheduler({
    startTime,
    bpm,
    beatsPerBar: pattern.timeSignature[0],
    accents: pattern.accents,
  });

  // 클릭을 마스터 게인 하나에 모아 둔다. 중지할 때 예약된 오실레이터를 일일이
  // 추적하지 않고 이 노드만 끊으면 되기 때문이다.
  const master = ctx.createGain();
  master.connect(ctx.destination);

  const tick = () => {
    for (const beat of scheduler.pull(ctx.currentTime)) {
      // 이미 지난 박은 버린다. 백그라운드 탭에서 타이머가 초 단위로 스로틀되면
      // 밀린 박이 한꺼번에 나오는데, 과거 시각으로 예약하면 전부 동시에 울린다.
      if (beat.time >= ctx.currentTime) {
        scheduleClick(ctx, master, beat.time, beat.isAccent);
      }
    }
    if (scheduler.isDone()) clearInterval(timer);
  };

  const timer = setInterval(tick, LOOKAHEAD_INTERVAL_MS);
  // 첫 예약은 타이머를 기다리지 않는다. 메인 스레드가 막혀 첫 tick이 밀려도
  // 첫 클릭은 이미 예약되어 있어야 한다.
  tick();

  return {
    startTime,
    endTime: scheduler.endTime,
    beatAt: scheduler.beatAt,
    stop() {
      clearInterval(timer);
      master.disconnect(); // 예약이 끝난 클릭도 소리로 나가지 않는다
    },
  };
}
