// 결과 화면 — Tech Spec §6, 디자인 문서.
import type { Pattern, SessionResult } from '../types';

export interface ResultScreenOptions {
  result: SessionResult;
  pattern: Pattern;
  /** 최고 기록을 실제로 갱신하고 저장까지 성공했는지. 배지 표시 조건. */
  isNewBest: boolean;
  onRetry(): void;
  onList(): void;
}

/** 결과 화면을 붙이고 정리 함수를 돌려준다. */
export function mountResult(
  root: HTMLElement,
  { result, pattern, isNewBest, onRetry, onList }: ResultScreenOptions,
): () => void {
  const { perfect, good, miss } = result.counts;

  root.innerHTML = `
    <section class="screen result">
      <p class="result__pattern">${pattern.name} · ${result.bpm} BPM</p>
      <p class="result__accuracy">${result.accuracy}%</p>
      ${isNewBest ? '<p class="result__badge">🏆 최고 기록 갱신!</p>' : ''}
      <dl class="result__counts">
        <div><dt>Perfect</dt><dd>${perfect}</dd></div>
        <div><dt>Good</dt><dd>${good}</dd></div>
        <div><dt>Miss</dt><dd>${miss}</dd></div>
        <div><dt>추가 탭</dt><dd>${result.extraTaps}</dd></div>
      </dl>
      <div class="result__actions">
        <button class="btn btn--primary" type="button" data-retry>다시하기</button>
        <button class="btn" type="button" data-list>목록으로</button>
      </div>
    </section>
  `;

  root.querySelector<HTMLButtonElement>('[data-retry]')!.addEventListener('click', onRetry);
  root.querySelector<HTMLButtonElement>('[data-list]')!.addEventListener('click', onList);

  return () => {
    root.innerHTML = '';
  };
}
