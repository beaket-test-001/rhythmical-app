// 설정 모달 — Tech Spec §6, 디자인 문서.
//
// 네이티브 <dialog>를 쓴다. 포커스 가두기 · Esc 닫기 · 배경 비활성화가
// 브라우저 기본 동작으로 따라오므로 직접 구현할 이유가 없다.
import { track } from '../analytics';
import { OFFSET_MAX_MS, OFFSET_MIN_MS } from '../constants';
import { loadSettings, saveSettings } from '../storage';

/** 설정 모달을 열고, 닫는 함수를 돌려준다. */
export function openSettings(): () => void {
  const { offsetMs } = loadSettings();

  const dialog = document.createElement('dialog');
  dialog.className = 'settings';
  dialog.innerHTML = `
    <form method="dialog" class="settings__head">
      <h2 class="settings__title">설정</h2>
      <button class="settings__close" type="submit" aria-label="설정 닫기">✕</button>
    </form>
    <label class="settings__field">
      <span class="settings__label">지연 보정</span>
      <input class="settings__slider" type="range"
             min="${OFFSET_MIN_MS}" max="${OFFSET_MAX_MS}" step="5" value="${offsetMs}"
             aria-label="지연 보정 오프셋(밀리초)" />
      <output class="settings__value">${offsetMs}ms</output>
    </label>
    <p class="settings__hint">
      소리가 늦게 들리면 값을 올리세요. 변경하면 바로 저장됩니다.
    </p>
  `;

  const slider = dialog.querySelector<HTMLInputElement>('.settings__slider')!;
  const value = dialog.querySelector<HTMLOutputElement>('.settings__value')!;

  // 즉시 저장(사양 §6). 슬라이더를 끄는 동안 매 프레임 저장되지만,
  // localStorage 쓰기 한 번은 충분히 싸다.
  slider.addEventListener('input', () => {
    const next = Number(slider.value);
    value.textContent = `${next}ms`;
    saveSettings({ offsetMs: next });
  });

  // 계측은 조작이 끝났을 때만. input마다 보내면 이벤트가 폭증한다.
  slider.addEventListener('change', () =>
    track('offset_changed', { offset_ms: Number(slider.value) }),
  );

  const close = () => {
    dialog.close();
    dialog.remove();
  };
  dialog.addEventListener('close', () => dialog.remove());

  document.body.appendChild(dialog);
  dialog.showModal();
  return close;
}
