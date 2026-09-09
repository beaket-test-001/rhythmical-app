// 연습 화면 — Tech Spec §4 · §6, 디자인 문서.
//
// 이 파일은 두 겹이다. startSession은 DOM 없이 도는 세션 컨트롤러이고,
// mountPractice는 그 위에 붙는 렌더링이다. 타이밍 판단을 DOM에서 떼어 놓아야
// 브라우저 없이 검증할 수 있다.
import { startMetronome, type Beat } from '../audio/metronome';
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
  const countInEndsAt = metronome.startTime + beatsPerBar * secondsPerBeat;

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
        const countdown = beatsPerBar - Math.floor(elapsed / secondsPerBeat);
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
}

/**
 * 연습 화면을 붙이고, 화면을 걷어내는 정리 함수를 돌려준다.
 *
 * 중지 · 완료 · 화면 전환 어느 경로로 나가든 정리 함수가 불려야 한다.
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
        <h1 class="topbar__title">${pattern.name}</h1>
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
        <p class="flash" role="status" aria-live="polite"></p>
      </div>
      <button class="tap-area" type="button">
        <span class="tap-area__hint">▶ 시작</span>
      </button>
    </section>
  `;

  const pick = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
  const backButton = pick<HTMLButtonElement>('.topbar__back');
  const slider = pick<HTMLInputElement>('.bpm__slider');
  const bpmValue = pick<HTMLOutputElement>('.bpm__value');
  const beatDots = [...root.querySelectorAll<HTMLElement>('.beat')];
  const countdownEl = pick<HTMLElement>('.countdown');
  const flashEl = pick<HTMLElement>('.flash');
  const tapArea = pick<HTMLButtonElement>('.tap-area');
  const tapHint = pick<HTMLElement>('.tap-area__hint');

  let ctx: AudioContext | null = null;
  let session: PracticeSession | null = null;
  let frame = 0;
  let flashTimer = 0;
  let shownBeat = -1;

  const showFlash = (kind: FlashKind) => {
    flashEl.textContent = FLASH_LABEL[kind];
    flashEl.className = `flash flash--${kind}`;
    // 다음 판정이 오면 타이머를 다시 잡아 이전 플래시가 먼저 지우지 않게 한다
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

  /** 화면과 오디오를 모두 멈춘다. 여러 번 불러도 안전하다. */
  const teardown = () => {
    cancelAnimationFrame(frame);
    clearTimeout(flashTimer);
    session?.stop();
    session = null;
    void ctx?.close();
    ctx = null;
  };

  const loop = () => {
    if (!session || !ctx) return;
    const snap = session.poll(ctx.currentTime);
    render(snap);

    if (snap.phase === 'finished') {
      const result = session.result();
      teardown();
      onFinish(result);
      return;
    }
    frame = requestAnimationFrame(loop);
  };

  const start = async () => {
    if (session) return;
    // AudioContext 생성과 resume은 사용자 제스처 안에서만 (iOS 자동재생 정책)
    ctx = new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume();

    session = startSession({ ctx, pattern, bpm, offsetMs });
    slider.disabled = true; // 재생 중에는 BPM만 잠근다. ← 뒤로가기는 계속 열려 있다
    tapHint.textContent = '';
    frame = requestAnimationFrame(loop);
  };

  const handleTap = (perfMs: number) => {
    if (!session) {
      void start();
      return;
    }
    const outcome = session.tap(perfMs);
    if (outcome === 'perfect' || outcome === 'good') showFlash(outcome);
  };

  /**
   * 입력 시각. event.timeStamp는 performance.now()와 같은 기준점을 쓰고
   * 하드웨어에 더 가까운 값이라 우선한다. 값이 없는 합성 이벤트만 대체한다.
   */
  const stampOf = (e: Event) => (e.timeStamp > 0 ? e.timeStamp : performance.now());

  const onPointerDown = (e: PointerEvent) => {
    e.preventDefault(); // 더블탭 확대와 뒤따르는 click 이벤트를 막는다
    handleTap(stampOf(e));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || e.repeat) return;
    e.preventDefault(); // 스페이스로 인한 스크롤과 버튼 클릭을 막는다
    handleTap(stampOf(e));
  };

  const exit = () => {
    teardown();
    onExit();
  };

  // 백그라운드로 가면 타이머가 스로틀되어 판정을 신뢰할 수 없다.
  // 사양 §4에 따라 중지와 동일하게 처리한다(결과 미저장).
  const onVisibilityChange = () => {
    if (document.hidden) exit();
  };

  tapArea.addEventListener('pointerdown', onPointerDown);
  backButton.addEventListener('click', exit);
  slider.addEventListener('input', () => {
    bpm = Number(slider.value);
    bpmValue.textContent = String(bpm);
  });
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    teardown();
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    root.innerHTML = '';
  };
}
