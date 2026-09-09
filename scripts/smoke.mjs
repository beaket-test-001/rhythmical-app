// 데스크톱 Chrome 스모크 테스트 — QA 문서의 체크리스트 중 자동화 가능한 항목.
//
// 설치된 Chrome을 CDP로 직접 몰기 때문에 추가 의존성이 없다(Node 내장 WebSocket).
//
// 덮는 항목:
//   - 패턴 5종 각각 시작 → 카운트인 → 연습 → 결과까지 크래시 없음
//   - 탭 입력: 포인터와 스페이스바 모두 판정됨
//   - BPM 슬라이더 범위가 패턴별 상한을 따름(셋잇단 100)
//   - 연습 중 뒤로가기로 중지, 기록 미저장
//   - 백그라운드 전환 시 중지 처리
//   - 패턴별 최고 기록 저장과 새로고침 후 유지
//   - 화면 회전 시 크래시 없음
//   - 단계 전환 시 비트 인디케이터 위치 유지
//   - 지연 보정 설정이 판정에 반영되는지
//
// 덮지 못하는 항목(실기기 필요):
//   - 실제 오디오 재생 여부(헤드리스에는 출력 장치가 없다)
//   - iOS Safari · Android Chrome 동작, 터치 입력 지연
//
// 사용법: npm run build && npx vite preview --port 4319 & node scripts/smoke.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP = process.argv[2] ?? 'http://localhost:4319/';
const PORT = 9333;
const CHROME =
  process.env.CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const PATTERNS = [
  { id: 'quarter', name: '4분음표', bpmMax: 120 },
  { id: 'eighth', name: '8분음표', bpmMax: 120 },
  { id: 'triplet', name: '셋잇단', bpmMax: 100 },
  { id: 'syncopation', name: '싱커페이션', bpmMax: 120 },
  { id: 'eighth-mix', name: '8비트 믹스', bpmMax: 120 },
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'rhythmical-smoke-'));
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let ws;
let nextId = 1;
const pending = new Map();
const pageErrors = [];

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(
      r.exceptionDetails.text +
        ' ' +
        (r.exceptionDetails.exception?.description ?? ''),
    );
  }
  return r.result.value;
};

/** 조건이 참이 될 때까지 폴링. */
const until = async (expr, label, timeoutMs = 30000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expr)) return;
    await wait(150);
  }
  throw new Error(`시간 초과: ${label}`);
};

const results = [];
const check = (ok, label, detail = '') => {
  results.push({ ok, label });
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ' — ' + detail : ''}`);
};

/** 목록 화면에서 패턴 카드를 눌러 연습 화면으로. */
const openPattern = async (id) => {
  await evaluate(`document.querySelector('[data-pattern="${id}"]').click()`);
  await until("!!document.querySelector('.practice')", `${id} 연습 화면`);
};

/** 설정 모달에서 지연 보정을 바꾼다. */
const setOffset = async (ms) => {
  await evaluate("document.querySelector('.topbar__settings').click()");
  await evaluate(`
    (() => {
      const s = document.querySelector('.settings__slider');
      s.value = '${ms}';
      s.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  `);
  await evaluate("document.querySelector('.settings__close').click()");
  await wait(150);
};

/** 세션을 시작하고 한 박 간격으로 계속 탭한다. */
const startTapping = (bpm, useSpaceBar) => evaluate(`
  (() => {
    const area = document.querySelector('.tap-area');
    area.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    window.__flashes = new Set();
    new MutationObserver(() => {
      const c = document.querySelector('.flash')?.className ?? '';
      const hit = c.match(/flash--(\\w+)/);
      if (hit) window.__flashes.add(hit[1]);
    }).observe(document.querySelector('.flash'), { attributes: true });

    const tap = ${useSpaceBar}
      ? () => document.dispatchEvent(
          new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
      : () => document.querySelector('.tap-area')?.dispatchEvent(
          new PointerEvent('pointerdown', { bubbles: true }));
    window.__taps = setInterval(tap, ${Math.round(60000 / bpm)});
  })()
`);

const stopTapping = () => evaluate('clearInterval(window.__taps)');

try {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    try {
      const list = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
    } catch {
      await wait(250);
    }
  }
  if (!target) throw new Error('Chrome CDP 연결 실패');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => (ws.onopen = resolve));
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push(msg.params.exceptionDetails?.exception?.description ?? '알 수 없는 예외');
    } else if (
      msg.method === 'Runtime.consoleAPICalled' &&
      msg.params.type === 'error'
    ) {
      pageErrors.push(String(msg.params.args?.[0]?.value ?? '콘솔 에러'));
    }
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: APP });
  await until("document.readyState === 'complete'", '페이지 로드');

  console.log('\n[1] 패턴 목록과 설정');
  check(
    (await evaluate("document.querySelectorAll('[data-pattern]').length")) === 5,
    '패턴 카드 5종 표시',
  );
  await evaluate("document.querySelector('.topbar__settings').click()");
  check(
    await evaluate("!!document.querySelector('dialog.settings')?.open"),
    '설정 모달 열림',
  );
  const range = await evaluate(
    "(()=>{const s=document.querySelector('.settings__slider');return s.min+'~'+s.max})()",
  );
  check(range === '-200~200', '지연 보정 범위 -200~200ms', range);
  await evaluate("document.querySelector('.settings__close').click()");
  await wait(150);
  check(
    !(await evaluate("!!document.querySelector('dialog.settings')")),
    '모달 닫힘 후 DOM에서 제거',
  );

  console.log('\n[2] 패턴 5종 완주 (시작 → 카운트인 → 연습 → 결과)');
  for (const [i, p] of PATTERNS.entries()) {
    await openPattern(p.id);

    const sliderMax = await evaluate(
      "Number(document.querySelector('.bpm__slider').max)",
    );
    check(sliderMax === p.bpmMax, `${p.name} BPM 상한 ${p.bpmMax}`, String(sliderMax));

    // 세션 길이를 줄이려고 상한으로 올린다. 슬라이더 반영도 함께 확인된다.
    await evaluate(`
      (() => {
        const s = document.querySelector('.bpm__slider');
        s.value = '${p.bpmMax}';
        s.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);
    check(
      (await evaluate("document.querySelector('.bpm__value').textContent")) ===
        String(p.bpmMax),
      `${p.name} BPM 슬라이더 변경 반영`,
    );

    // 홀수 번째 패턴은 스페이스바로 친다 — 두 입력 경로를 모두 덮는다
    const useSpace = i % 2 === 1;
    await startTapping(p.bpmMax, useSpace);
    await until("!!document.querySelector('.result')", `${p.name} 결과 화면`, 45000);
    await stopTapping();

    const r = await evaluate(`(() => ({
      accuracy: document.querySelector('.result__accuracy').textContent.trim().replace(/\\s+/g,' '),
      counts: [...document.querySelectorAll('.result__counts dd')].map(e => e.textContent.trim()),
      flashes: [...(window.__flashes ?? [])],
    }))()`);
    check(
      r.counts.length === 4 && /\d/.test(r.accuracy),
      `${p.name} 결과 표시 (${useSpace ? '스페이스바' : '포인터'} 입력)`,
      `${r.accuracy} · P/G/M/추가 ${r.counts.join('/')}`,
    );
    // 한 박 간격으로 쳤으므로 어느 패턴이든 박 위에 오는 기대 탭은 맞는다.
    // 여기서 0이면 입력 경로 자체가 죽은 것이다 — 실제로 스페이스바가 그랬다.
    const matched = Number(r.counts[0] ?? 0) + Number(r.counts[1] ?? 0);
    check(
      matched > 0,
      `${p.name} ${useSpace ? '스페이스바' : '포인터'} 입력이 판정됨`,
      `Perfect+Good ${matched}`,
    );
    check(
      r.flashes.length > 0,
      `${p.name} 판정 플래시 발생`,
      r.flashes.join(', '),
    );

    await evaluate(
      "[...document.querySelectorAll('.result__actions button')].find(b=>b.textContent.trim()==='목록으로').click()",
    );
    await until("!!document.querySelector('.list')", '목록 복귀');
  }

  console.log('\n[3] 기록 저장');
  const stored = JSON.parse(
    (await evaluate("localStorage.getItem('rhythmical.records.v1')")) ?? '[]',
  );
  check(stored.length === 5, '패턴 5종 기록 저장', `${stored.length}종`);
  await send('Page.reload');
  await until("!!document.querySelector('.list')", '새로고침 후 목록');
  const shown = await evaluate(
    "[...document.querySelectorAll('.card__best')].map(e=>e.textContent.trim()).filter(t=>t.includes('%')).length",
  );
  check(shown === 5, '새로고침 후에도 최고 기록 유지', `${shown}종 표시`);


  console.log('\n[4] 지연 보정이 판정에 반영되는지');
  // 한 박 간격으로 정확히 치면 보정 0에서는 전부 perfect다. 보정을 +200ms 주면
  // 판정 시각이 200ms 앞으로 밀려 허용 오차(±120ms) 밖으로 나가야 한다.
  // 여기서 정확도가 그대로면 설정이 판정까지 닿지 않는 것이다.
  await evaluate("localStorage.clear()");
  await send('Page.reload');
  await until("!!document.querySelector('.list')", '목록');

  const runQuarter = async () => {
    await openPattern('quarter');
    await evaluate(`
      (() => {
        const s = document.querySelector('.bpm__slider');
        s.value = '120';
        s.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);
    await startTapping(120, false);
    await until("!!document.querySelector('.result')", '결과 화면', 45000);
    await stopTapping();
    const counts = await evaluate(
      "[...document.querySelectorAll('.result__counts dd')].map(e => Number(e.textContent.trim()))",
    );
    await evaluate(
      "[...document.querySelectorAll('.result__actions button')].find(b=>b.textContent.trim()==='목록으로').click()",
    );
    await until("!!document.querySelector('.list')", '목록 복귀');
    return counts; // [perfect, good, miss, extraTaps]
  };

  const noOffset = await runQuarter();
  await setOffset(200);
  const withOffset = await runQuarter();
  check(
    (noOffset[0] ?? 0) > 0 && (withOffset[0] ?? 0) === 0,
    '지연 보정 +200ms가 판정 시각을 실제로 옮긴다',
    `보정 0 → Perfect ${noOffset[0]} / 보정 200 → Perfect ${withOffset[0]}, Miss ${withOffset[2]}`,
  );
  await setOffset(0);
  check(
    (await evaluate("JSON.parse(localStorage.getItem('rhythmical.settings.v1')).offsetMs")) === 0,
    '설정이 localStorage에 즉시 저장된다',
  );

  console.log('\n[5] 레이아웃 안정성');
  // 카운트다운이 뜨고 사라질 때 비트 인디케이터가 움직이면, 연습 중 시선이
  // 한 곳에 머물러야 한다는 디자인 원칙이 깨진다.
  await openPattern('quarter');
  const beatsTop = () =>
    evaluate("Math.round(document.querySelector('.beats').getBoundingClientRect().top)");
  const beforeStart = await beatsTop();
  await startTapping(120, false);
  await until("document.querySelector('.countdown').textContent !== ''", '카운트인', 8000);
  const duringCountIn = await beatsTop();
  await until("document.querySelector('.countdown').textContent === ''", '연습 구간', 12000);
  const duringPlay = await beatsTop();
  await stopTapping();
  check(
    beforeStart === duringCountIn && duringCountIn === duringPlay,
    '단계가 바뀌어도 비트 인디케이터가 움직이지 않는다',
    `시작 전 ${beforeStart} / 카운트인 ${duringCountIn} / 연습 ${duringPlay}`,
  );
  await evaluate("document.querySelector('.topbar__back').click()");
  await until("!!document.querySelector('.list')", '목록 복귀');

  console.log('\n[6] 중지 경로 (결과 미저장)');
  await evaluate("localStorage.removeItem('rhythmical.records.v1')");
  await send('Page.reload');
  await until("!!document.querySelector('.list')", '목록');
  await openPattern('quarter');
  await startTapping(120, false);
  await until(
    "document.querySelector('.countdown').textContent !== ''",
    '카운트인 진입',
    8000,
  );
  await evaluate("document.querySelector('.topbar__back').click()");
  await stopTapping();
  await until("!!document.querySelector('.list')", '뒤로가기 → 목록');
  check(
    !(await evaluate("localStorage.getItem('rhythmical.records.v1')")),
    '카운트인 중 중지 시 기록 미저장',
  );

  console.log('\n[7] 백그라운드 전환과 화면 회전');
  await openPattern('quarter');
  await startTapping(120, false);
  await until("!!document.querySelector('.beat--on')", '재생 시작', 10000);
  await evaluate(`
    (() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    })()
  `);
  await stopTapping();
  await until("!!document.querySelector('.list')", '백그라운드 전환 → 중지');
  check(
    !(await evaluate("localStorage.getItem('rhythmical.records.v1')")),
    '백그라운드 전환 시 중지, 기록 미저장',
  );

  await send('Emulation.setDeviceMetricsOverride', {
    width: 844, height: 390, deviceScaleFactor: 2, mobile: true,
  });
  await wait(300);
  check(
    await evaluate("!!document.querySelector('.list') && document.querySelectorAll('[data-pattern]').length === 5"),
    '가로 회전 후에도 목록 정상',
  );
  await send('Emulation.clearDeviceMetricsOverride');

  check(pageErrors.length === 0, '브라우저 콘솔 에러 0건', pageErrors.slice(0, 2).join(' | '));
} catch (e) {
  check(false, '스모크 진행 중 오류', String(e.message).slice(0, 300));
} finally {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n결과: ${results.length - failed.length}/${results.length} 통과`);
  if (failed.length) {
    console.log('실패 항목:');
    for (const f of failed) console.log(`  - ${f.label}`);
  }
  ws?.close();
  chrome.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
  process.exit(failed.length ? 1 : 0);
}
