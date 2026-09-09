// 진입점.
// TODO: 패턴 목록 · 결과 · 설정 화면과 전환은 T8 · T9 · T11에서 붙인다.
//       지금은 연습 화면만 직접 띄워 코어 루프를 확인한다.
import './style.css';
import { PATTERNS } from './core/patterns';
import { loadSettings } from './storage';
import { mountPractice } from './ui/practice';

const app = document.querySelector<HTMLDivElement>('#app')!;

function openPractice() {
  const pattern = PATTERNS[0]!;
  const unmount = mountPractice(app, {
    pattern,
    bpm: pattern.bpmDefault,
    offsetMs: loadSettings().offsetMs,
    onExit: () => {
      unmount();
      openPractice(); // 목록 화면이 붙기 전까지는 다시 연습 화면으로
    },
    onFinish: (result) => {
      unmount();
      // TODO: T9에서 결과 화면으로 교체
      console.log('세션 결과', result);
      openPractice();
    },
  });
}

openPractice();
