// 진입점 + 화면 전환.
//
// 해시 없는 단순 상태 전환(Tech Spec §7). 화면은 mount 함수가 정리 함수를
// 돌려주는 규약을 지키고, 여기서는 전환할 때마다 이전 화면을 반드시 걷어낸다.
// 그래야 타이머 · 리스너 · AudioContext가 화면 수만큼 쌓이지 않는다.
import './style.css';
import { track } from './analytics';
import { loadSettings, saveRecord } from './storage';
import { mountList } from './ui/list';
import { mountPractice } from './ui/practice';
import { mountResult } from './ui/result';
import { openSettings } from './ui/settings';
import type { Pattern, SessionResult } from './types';

const app = document.querySelector<HTMLDivElement>('#app')!;

/** 지금 붙어 있는 화면의 정리 함수. */
let unmount: (() => void) | null = null;

function show(mount: (root: HTMLElement) => () => void) {
  // 먼저 비우고 호출한다. mount가 던져도 이미 쓴 정리 함수가 남아 다음
  // 전환에서 두 번 불리는 일이 없다.
  const previous = unmount;
  unmount = null;
  previous?.();
  unmount = mount(app);

  // 화면이 통째로 바뀌면 포커스가 body로 떨어져 스크린리더가 새 화면을
  // 읽지 않는다. 각 화면의 제목으로 옮겨 준다.
  app.querySelector<HTMLElement>('h1')?.focus();
}

function showList() {
  show((root) =>
    mountList(root, {
      onSelect: (pattern) => showPractice(pattern, pattern.bpmDefault),
      // 모달은 라우터가 관리하는 화면 밖(body)에 붙고 스스로 닫힌다
      onOpenSettings: () => void openSettings(),
    }),
  );
}

function showPractice(pattern: Pattern, bpm: number, autoStart = false) {
  show((root) =>
    mountPractice(root, {
      pattern,
      bpm,
      autoStart,
      // 지연 보정은 세션 시작 시점의 값을 쓴다. 진행 중 바뀌면 판정 기준이 흔들린다
      offsetMs: loadSettings().offsetMs,
      onExit: showList,
      onFinish: (result) => showResult(pattern, result),
    }),
  );
}

function showResult(pattern: Pattern, result: SessionResult) {
  // 배지는 "저장까지 성공한 갱신"일 때만 띄운다. 저장이 실패했는데 갱신을
  // 알리면 목록 화면과 어긋난다(사양 §2 "저장 실패는 기록만 비활성").
  const isNewBest = saveRecord(result.patternId, result.accuracy);

  show((root) =>
    mountResult(root, {
      result,
      isNewBest,
      onRetry: () => {
        track('retry', { pattern_id: pattern.id });
        // 사양 §4는 finished → countIn. 다시하기 클릭 자체가 사용자
        // 제스처라 한 번 더 탭하지 않아도 오디오를 시작할 수 있다.
        showPractice(pattern, result.bpm, true);
      },
      onList: showList,
    }),
  );

  track('practice_complete', {
    pattern_id: result.patternId,
    bpm: result.bpm,
    accuracy: result.accuracy,
    perfect: result.counts.perfect,
    good: result.counts.good,
    miss: result.counts.miss,
    extra_taps: result.extraTaps,
    is_new_best: isNewBest,
  });
}

showList();
