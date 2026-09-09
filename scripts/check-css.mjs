// style.css 구조 검사.
//
// CSS 파서는 닫히지 않은 블록을 파일 끝에서 조용히 닫아 준다. 그래서 미디어
// 쿼리 하나가 안 닫히면 뒤따르는 규칙 전부가 그 안에 갇히는데도 빌드와 타입
// 체크는 그대로 통과한다. 실제로 목록·결과 화면 스타일이 통째로 감속 모션
// 블록에 갇힌 적이 있어 최소한의 검사를 남긴다.
//
// 정의되지 않은 커스텀 속성도 함께 본다. var(--없는이름)은 선언 전체를 무효로
// 만드는데 브라우저는 조용히 넘어간다. 실제로 --countdown-size 오타 하나가
// font-size와 min-height를 동시에 죽여 레이아웃이 밀린 적이 있다.
//
// vitest는 CSS 임포트를 빈 문자열로 스텁하므로 단위 테스트로는 확인할 수 없다.
import { readFileSync } from 'node:fs';

const path = new URL('../src/style.css', import.meta.url);
// 주석 안의 중괄호는 세지 않는다. 이 파일에는 문자열 리터럴이 없다.
const css = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const problems = [];

const open = (css.match(/\{/g) ?? []).length;
const close = (css.match(/\}/g) ?? []).length;
if (open !== close) {
  problems.push(`중괄호 불균형: 여는 괄호 ${open}개, 닫는 괄호 ${close}개`);
}

const declared = new Set([...css.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]));
for (const [, name] of css.matchAll(/var\(\s*(--[\w-]+)/g)) {
  if (!declared.has(name)) problems.push(`정의되지 않은 커스텀 속성: var(${name})`);
}

// @media 블록을 통째로 걷어내도 남아 있어야 하는 선택자들
const outsideMedia = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
for (const selector of ['.card', '.result__accuracy', '.btn', '.tap-area', '.beat', '.feedback']) {
  if (!outsideMedia.includes(selector)) {
    problems.push(`${selector} 규칙이 @media 블록 안에 갇혀 있다`);
  }
}

if (problems.length > 0) {
  console.error('style.css 검사 실패:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('style.css 검사 통과');
