// 진입점.
// TODO: 화면 전환(목록 / 연습 / 결과 / 설정)은 T8에서 구현한다. 현재는 셋업 확인용 임시 표시.
import { PATTERNS } from './core/patterns';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.textContent = `리드미컬 — 패턴 ${PATTERNS.length}종 준비됨`;
