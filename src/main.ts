// 진입점 — 화면 전환은 T8에서 붙인다.
import { PATTERNS } from './core/patterns';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.textContent = `리드미컬 — 패턴 ${PATTERNS.length}종 준비됨`;
