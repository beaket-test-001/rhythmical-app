// 설정 모달 — Tech Spec §6, 디자인 문서.
//
// 네이티브 <dialog>를 쓴다. 포커스 가두기 · Esc 닫기 · 배경 비활성화가
// 브라우저 기본 동작으로 따라오므로 직접 구현할 이유가 없다.
import { track } from '../analytics';
import { OFFSET_MAX_MS, OFFSET_MIN_MS } from '../constants';
import { loadSettings, saveSettings } from '../storage';

/**
 * 설정 모달을 연다. 닫기는 <dialog>가 스스로 처리하므로 반환값이 없다.
 *
 * TODO: 보정 도우미(메트로놈에 맞춰 8회 탭 → 평균 오차 제안)는 P2.
 *       사양 §6에서 MVP 필수가 아니라고 명시했다.
 */
export function openSettings(): void {
  const { offsetMs: entryOffsetMs } = loadSettings();
  const offsetMs = entryOffsetMs;

  const dialog = document.createElement('dialog');
  dialog.className = 'settings';
  dialog.setAttribute('aria-labelledby', 'settings-title');
  dialog.innerHTML = `
    <form method="dialog" class="settings__head">
      <h2 class="settings__title" id="settings-title">설정</h2>
      <button class="settings__close" type="submit" aria-label="설정 닫기">✕</button>
    </form>
    <label class="settings__field">
      <span class="settings__label">지연 보정</span>
      <output class="settings__value">${offsetMs}ms</output>
      <span class="settings__bound">${OFFSET_MIN_MS}</span>
      <input class="settings__slider" type="range"
             min="${OFFSET_MIN_MS}" max="${OFFSET_MAX_MS}" step="5" value="${offsetMs}"
             aria-label="지연 보정 오프셋(밀리초)" />
      <span class="settings__bound">+${OFFSET_MAX_MS} ms</span>
    </label>
    <p class="settings__hint">
      소리가 늦게 들리면 값을 올리세요. 변경하면 바로 저장됩니다.
    </p>
  `;

  const slider = dialog.querySelector<HTMLInputElement>('.settings__slider')!;
  const value = dialog.querySelector<HTMLOutputElement>('.settings__value')!;

  // 즉시 저장(사양 §6). 드래그 중 매 프레임 쓰지만 localStorage 쓰기 한 번은
  // 충분히 싸다. 문제가 되면 rAF로 묶는다.
  slider.addEventListener('input', () => {
    const next = Number(slider.value);
    value.textContent = `${next}ms`;
    saveSettings({ offsetMs: next });
  });

  // 계측은 모달이 닫힐 때 진입값과 비교해 한 번만 보낸다.
  // change 이벤트에 걸면 드래그 중 Esc로 닫을 때 유실되고,
  // 좌우로 두 번 조정하면 한 번의 조작에 두 건이 나간다.
  dialog.addEventListener('close', () => {
    const finalOffsetMs = Number(slider.value);
    if (finalOffsetMs !== entryOffsetMs) {
      track('offset_changed', { offset_ms: finalOffsetMs });
    }
    dialog.remove();
  });

  document.body.appendChild(dialog);
  dialog.showModal();
}
