// 연습 화면 — Tech Spec §4 · §6, 디자인 문서.
//
// 이 파일은 두 겹이다. startSession은 DOM 없이 도는 세션 컨트롤러이고,
// mountPractice는 그 위에 붙는 렌더링이다. 타이밍 판단을 DOM에서 떼어 놓아야
// 브라우저 없이 검증할 수 있다.
import { startMetronome, type Beat } from '../audio/metronome';
import { track } from '../analytics';
import { COUNT_IN_BARS } from '../constants';
import { createJudger, expectedTapTimes, type TapOutcome } from '../core/judge';
import type { Pattern, SessionResult } from '../types';

export type Phase = 'countIn' | 'playing' | 'finished';

/** 한 프레임에 그릴 상태. 렌더러는 이 값만 보고 그린다. */
export interface PracticeSnapshot {
  phase: Phase;
  /** 지금 울리고 있는 박. 시작 전이거나 끝난 뒤면 null. */
  beat: Beat | null;
  /** 카운트인 남은 수(4 → 1). 카운트인이 아니면 null. */
  countdown: number | null;
  /** 이 프레임에 새로 확정된 miss 수. 플래시 표시용. */
  newMisses: number;
}

export interface PracticeSession {
  /** 탭 입력. perfMs는 performance.now() 축(ms). */
  tap(perfMs: number): TapOutcome;
  /** 매 프레임 호출. 새 miss 수집과 종료 판단을 겸한다. */
  poll(now: number): PracticeSnapshot;
  /** 중지. 예약된 클릭도 함께 끊는다. */
  stop(): void;
  result(): SessionResult;
}

export interface PracticeSessionOptions {
  ctx: AudioContext;
  pattern: Pattern;
  bpm: number;
  offsetMs: number;
}

/**
 * 메트로놈과 판정기를 묶어 한 세션을 시작한다.
 *
 * 호출 전에 사용자 제스처로 ctx.resume()이 끝나 있어야 한다(iOS 자동재생 정책).
 */
export function startSession({
  ctx,
  pattern,
  bpm,
  offsetMs,
}: PracticeSessionOptions): PracticeSession {
  // 시간 축 기준점. 메트로놈은 AudioContext 축(초), 입력 이벤트는
  // performance.now() 축(ms)이라 축이 다르다. 두 시계를 같은 순간에 읽어
  // anchor를 만들고 모든 탭을 AudioContext 축으로 옮긴다 (Tech Spec §3).
  const anchor = { audio: ctx.currentTime, perf: performance.now() };
  const toAudioTime = (perfMs: number) =>
    anchor.audio + (perfMs - anchor.perf) / 1000;

  const metronome = startMetronome({ ctx, pattern, bpm });
  const judger = createJudger(
    expectedTapTimes(pattern, bpm, metronome.startTime),
    offsetMs,
  );

  const beatsPerBar = pattern.timeSignature[0];
  const secondsPerBeat = 60 / bpm;
  const countInBeats = COUNT_IN_BARS * beatsPerBar;
  const countInEndsAt = metronome.startTime + countInBeats * secondsPerBeat;

  // 마디가 끝나도 마지막 판정 창이 아직 안 닫혔을 수 있다. 늦은 쪽까지 기다린다.
  const finishesAt = Math.max(metronome.endTime, judger.settledAt);

  return {
    tap: (perfMs) => judger.tap(toAudioTime(perfMs)),

    poll(now) {
      const newMisses = judger.collectMisses(now).length;

      if (now >= finishesAt) {
        return { phase: 'finished', beat: null, countdown: null, newMisses };
      }

      const beat = metronome.beatAt(now);
      if (now < countInEndsAt) {
        const elapsed = Math.max(0, now - metronome.startTime);
        const countdown = countInBeats - Math.floor(elapsed / secondsPerBeat);
        return { phase: 'countIn', beat, countdown, newMisses };
      }
      return { phase: 'playing', beat, countdown: null, newMisses };
    },

    stop: () => metronome.stop(),
    result: () => judger.result(pattern.id, bpm),
  };
}

/** 판정 라벨. 색만으로 구분하지 않도록 텍스트를 병기한다(색약 대응). */
const FLASH_LABEL = {
  perfect: 'PERFECT',
  good: 'GOOD',
  miss: 'MISS',
} as const;

type FlashKind = keyof typeof FLASH_LABEL;

/** 판정 플래시가 사라지기까지(ms). 디자인 문서의 0.3초. */
const FLASH_MS = 300;

export interface PracticeScreenOptions {
  pattern: Pattern;
  bpm: number;
  offsetMs: number;
  /** 목록으로 돌아간다. 중지(결과 미저장)를 포함한다. */
  onExit(): void;
  onFinish(result: SessionResult): void;
  /**
   * 붙자마자 카운트인을 시작한다. 사양 §4의 finished → countIn(다시하기)용.
   * 호출이 사용자 제스처의 콜스택 안에 있어야 AudioContext를 만들 수 있다.
   */
  autoStart?: boolean;
}

/**
 * 연습 화면을 붙이고, 화면을 걷어내는 정리 함수를 돌려준다.
 *
 * 중지 · 완료 · 화면 전환 어느 경로로 나가든 정리 함수가 불려야 한다.
 * 타이머 · rAF · 이벤트 리스너 · AudioContext가 전부 여기서 정리된다.
 */
/**
 * 화면의 진행 단계.
 *
 * bool 여러 개로 나누면 "시작 중인데 이미 죽은" 같은 불가능한 조합이 생긴다.
 * 입력 · 종료 · 정리가 모두 이 값 하나를 본다.
 */
type Stage = 'idle' | 'starting' | 'running' | 'ending' | 'dead';

/**
 * 연습 화면을 붙이고, 화면을 걷어내는 정리 함수를 돌려준다.
 *
 * 중지 · 완료 · 백그라운드 전환 어느 경로로 나가든 정리 함수가 불려야 한다.
 * 타이머 · rAF · 이벤트 리스너 · AudioContext가 전부 여기서 정리된다.
 */
export function mountPractice(
  root: HTMLElement,
  opts: PracticeScreenOptions,
): () => void {
  const { pattern, offsetMs, onExit, onFinish } = opts;
  const beatsPerBar = pattern.timeSignature[0];
  let bpm = opts.bpm;

  const dots = Array.from({ length: beatsPerBar }, (_, i) =>
    `<span class="beat${pattern.accents.includes(i) ? ' beat--accent' : ''}"></span>`,
  ).join('');

  root.innerHTML = `
    <section class="screen practice">
      <header class="topbar">
        <button class="topbar__back" type="button" aria-label="중지하고 목록으로">←</button>
        <h1 class="topbar__title" tabindex="-1"></h1>
        <label class="bpm">
          <span class="bpm__label">BPM</span>
          <input class="bpm__slider" type="range" min="${pattern.bpmMin}"
                 max="${pattern.bpmMax}" value="${bpm}" step="1"
                 aria-label="BPM 조절" />
          <output class="bpm__value">${bpm}</output>
        </label>
      </header>
      <div class="stage">
        <div class="beats" aria-hidden="true">${dots}</div>
        <p class="countdown" aria-hidden="true"></p>
        <!-- 초당 여러 번 바뀌는 시각 피드백이라 스크린리더에는 읽히지 않는다.
             판정 요약은 결과 화면이 담당한다. -->
        <p class="flash" aria-hidden="true"></p>
      </div>
      <button class="tap-area" type="button" aria-label="탭">
        <span class="tap-area__hint">▶ 시작</span>
      </button>
    </section>
  `;

  const pick = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
  pick<HTMLElement>('.topbar__title').textContent = pattern.name;

  const screen = pick<HTMLElement>('.practice');
  const backButton = pick<HTMLButtonElement>('.topbar__back');
  const slider = pick<HTMLInputElement>('.bpm__slider');
  const bpmValue = pick<HTMLOutputElement>('.bpm__value');
  const beatsEl = pick<HTMLElement>('.beats');
  const beatDots = [...root.querySelectorAll<HTMLElement>('.beat')];
  const countdownEl = pick<HTMLElement>('.countdown');
  const flashEl = pick<HTMLElement>('.flash');
  const tapArea = pick<HTMLButtonElement>('.tap-area');
  const tapHint = pick<HTMLElement>('.tap-area__hint');

  let stage: Stage = 'idle';
  let ctx: AudioContext | null = null;
  let session: PracticeSession | null = null;
  let frame = 0;
  let flashTimer = 0;
  let endTimer = 0;
  let shownBeat = -1;
  let lastFlashAt = -Infinity;
  /** 중도 이탈 시 얼마나 하다 그만뒀는지 재기 위한 시작 시각. */
  let startedAtMs = 0;

  /**
   * 판정 플래시.
   *
   * miss는 양보한다(yielding). 앞 음의 miss 마감과 방금 친 탭의 판정이 한
   * 프레임에 겹치는 건 정상 시나리오인데, 그때 miss가 덮으면 사용자는 잘 친
   * 탭이 빨간 MISS로 보이는 것만 본다. 방금 한 행동의 결과가 더 필요한 정보다.
   */
  const showFlash = (kind: FlashKind) => {
    const now = performance.now();
    if (kind === 'miss' && now - lastFlashAt < FLASH_MS) return;
    lastFlashAt = now;

    flashEl.textContent = FLASH_LABEL[kind];
    flashEl.className = `flash flash--${kind}`;
    if (kind === 'perfect') {
      // 디자인의 "초록 플래시 + 인디케이터 펄스". 클래스를 다시 붙여 재생시킨다
      beatsEl.classList.remove('beats--pulse');
      void beatsEl.offsetWidth;
      beatsEl.classList.add('beats--pulse');
    }

    clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => {
      flashEl.className = 'flash';
      flashEl.textContent = '';
    }, FLASH_MS);
  };

  const render = (snap: PracticeSnapshot) => {
    const index = snap.beat?.index ?? -1;
    if (index !== shownBeat) {
      shownBeat = index;
      const inBar = index < 0 ? -1 : index % beatsPerBar;
      beatDots.forEach((dot, i) => dot.classList.toggle('beat--on', i === inBar));
    }
    countdownEl.textContent = snap.countdown === null ? '' : String(snap.countdown);
    if (snap.newMisses > 0) showFlash('miss');
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || e.repeat) return;
    // 다른 컨트롤에 포커스가 있으면 브라우저에 맡긴다. 뒤로가기 버튼은
    // 재생 중에도 항상 활성이어야 하는데, 여기서 삼키면 스페이스로 못 누른다.
    const focused = document.activeElement;
    if (focused && focused !== document.body && focused !== tapArea) return;

    e.preventDefault(); // 스페이스로 인한 스크롤 방지
    handleTap(stampOf(e));
  };

  // 백그라운드로 가면 타이머가 스로틀되어 판정을 신뢰할 수 없다.
  // 사양 §4에 따라 카운트인 · 재생 중일 때만 중지와 동일하게 처리한다.
  const onVisibilityChange = () => {
    if (document.hidden && (stage === 'running' || stage === 'starting')) exit();
  };

  /**
   * 화면과 오디오를 모두 멈춘다. 여러 번 불러도 안전하다.
   *
   * document 리스너까지 여기서 회수한다. 호출자가 정리 함수를 부르기 전까지
   * 리스너가 살아 있으면, 이미 멈춘 화면에서 스페이스바가 새 세션을 시작한다.
   */
  const teardown = () => {
    stage = 'dead';
    cancelAnimationFrame(frame);
    clearTimeout(flashTimer);
    clearTimeout(endTimer);
    session?.stop();
    session = null;
    ctx?.close().catch(() => void 0); // 이미 닫혔으면 무시
    ctx = null;
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };

  const loop = () => {
    if (stage !== 'running' || !session || !ctx) return;
    const snap = session.poll(ctx.currentTime);
    render(snap);

    if (snap.phase === 'finished') {
      const result = session.result();
      stage = 'ending';
      session.stop(); // 오디오는 즉시 멈춘다
      session = null;

      // 마지막 판정 플래시가 보일 시간을 준다. 바로 전환하면 종료 프레임에
      // 그려진 플래시가 0프레임 만에 사라진다(디자인의 100ms 피드백 요건).
      endTimer = window.setTimeout(() => {
        teardown();
        onFinish(result);
      }, FLASH_MS);
      return;
    }
    frame = requestAnimationFrame(loop);
  };

  const start = async () => {
    // session만으로는 막지 못한다. resume()을 기다리는 동안 두 번째 입력이
    // 들어오면 AudioContext가 두 개 생기고, 첫 번째는 참조를 잃어 타이머와
    // 함께 영원히 남는다. 멀티터치와 pointerdown + Space 조합에서 실제로 겹친다.
    if (stage !== 'idle') return;
    stage = 'starting';

    // AudioContext 생성과 resume은 사용자 제스처 안에서만 (iOS 자동재생 정책)
    const audio = new AudioContext();
    try {
      if (audio.state === 'suspended') await audio.resume();
    } catch {
      // 재생을 시작하지 못하면 아래에서 컨텍스트를 되돌린다
    }

    // 기다리는 사이에 화면을 떠났다면 방금 만든 컨텍스트를 되돌린다
    if (stage !== 'starting') {
      audio.close().catch(() => void 0);
      return;
    }

    ctx = audio;
    session = startSession({ ctx, pattern, bpm, offsetMs });
    stage = 'running';
    startedAtMs = performance.now();
    track('practice_start', { pattern_id: pattern.id, bpm });

    slider.disabled = true; // 재생 중에는 BPM만 잠근다. ← 뒤로가기는 계속 열려 있다
    tapHint.textContent = '';
    // 연습 중 시선은 인디케이터 한 곳에만 — 나머지 UI는 흐리게(디자인 원칙)
    screen.classList.add('practice--running');
    frame = requestAnimationFrame(loop);
  };

  function handleTap(perfMs: number) {
    if (stage === 'idle') {
      void start();
      return;
    }
    if (stage !== 'running' || !session) return;
    const outcome = session.tap(perfMs);
    if (outcome === 'perfect' || outcome === 'good') showFlash(outcome);
  }

  /**
   * 입력 시각. event.timeStamp는 performance.now()와 같은 기준점을 쓰고
   * 하드웨어에 더 가까운 값이라 우선한다. 값이 없는 합성 이벤트만 대체한다.
   */
  function stampOf(e: Event) {
    return e.timeStamp > 0 ? e.timeStamp : performance.now();
  }

  function exit() {
    // teardown이 stage를 바꾸므로 먼저 읽는다
    const wasPlaying = stage === 'running' || stage === 'starting';
    teardown();
    if (wasPlaying) {
      track('practice_abort', {
        pattern_id: pattern.id,
        elapsed_sec: Math.round((performance.now() - startedAtMs) / 1000),
      });
    }
    onExit();
  }

  const onPointerDown = (e: PointerEvent) => {
    e.preventDefault(); // 더블탭 확대와 뒤따르는 click 이벤트를 막는다
    handleTap(stampOf(e));
  };

  tapArea.addEventListener('pointerdown', onPointerDown);
  backButton.addEventListener('click', exit);
  slider.addEventListener('input', () => {
    bpm = Number(slider.value);
    bpmValue.textContent = String(bpm);
  });
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('visibilitychange', onVisibilityChange);

  if (opts.autoStart) void start();

  return () => {
    teardown();
    root.innerHTML = '';
  };
}
