// 패턴 목록 화면 — Tech Spec §6, 디자인 문서, v1.0.1 PRD §3.1(피드백 창구).
import { FEEDBACK_URL } from '../constants';
import { PATTERNS } from '../core/patterns';
import { loadRecords } from '../storage';
import type { Pattern } from '../types';

/** 최고 기록 표시. 기록이 없으면 사양대로 "—". */
export const formatBest = (accuracy: number | null): string =>
  accuracy === null ? '—' : `${accuracy}%`;

export interface ListScreenOptions {
  onSelect(pattern: Pattern): void;
  onOpenSettings(): void;
}

/** 패턴 목록을 붙이고 정리 함수를 돌려준다. */
export function mountList(
  root: HTMLElement,
  { onSelect, onOpenSettings }: ListScreenOptions,
): () => void {
  // 저장소는 한 번만 읽는다. 카드마다 조회하면 마운트 1회에 파싱이 5번 돈다.
  const best = new Map(loadRecords().map((r) => [r.patternId, r.bestAccuracy]));

  const cards = PATTERNS.map(
    (p) => `
      <li>
        <button class="card" type="button" data-pattern="${p.id}">
          <span class="card__name">${p.name}</span>
          <span class="card__bpm">${p.bpmDefault} BPM</span>
          <span class="card__best">최고 기록 ${formatBest(best.get(p.id) ?? null)}</span>
        </button>
      </li>`,
  ).join('');

  root.innerHTML = `
    <section class="screen list">
      <header class="topbar">
        <h1 class="topbar__title" tabindex="-1">리드미컬</h1>
        <button class="topbar__settings" type="button" aria-label="설정 열기">⚙</button>
      </header>
      <ul class="cards">${cards}</ul>
      <footer class="footer">
        <a class="footer__link" target="_blank" rel="noopener noreferrer">
          의견 보내기<span class="visually-hidden"> (새 창에서 열림)</span>
        </a>
      </footer>
    </section>
  `;

  // href는 보간하지 않고 속성으로 넣는다. PRD가 "상수만 바꿔 대체"를 권하는
  // 값이라, 따옴표가 든 주소로 바뀌면 innerHTML 보간은 속성을 탈출한다.
  root.querySelector<HTMLAnchorElement>('.footer__link')!.href = FEEDBACK_URL;

  const onClick = (e: Event) => {
    const button = (e.target as HTMLElement).closest<HTMLElement>('[data-pattern]');
    if (!button) return;
    const pattern = PATTERNS.find((p) => p.id === button.dataset['pattern']);
    if (pattern) onSelect(pattern);
  };

  const settingsButton = root.querySelector<HTMLButtonElement>('.topbar__settings')!;
  root.querySelector<HTMLElement>('.cards')!.addEventListener('click', onClick);
  settingsButton.addEventListener('click', onOpenSettings);

  return () => {
    root.innerHTML = ''; // 리스너는 제거된 노드와 함께 사라진다
  };
}
