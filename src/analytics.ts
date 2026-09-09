// 계측 래퍼 — Analytics 문서.
//
// v0.1은 이벤트를 수집하지 않는다. 호스팅을 GitHub Pages로 정하면서 호스팅
// 내장 계측(Vercel Web Analytics)을 쓸 수 없게 됐고, 새 도구를 붙이는 것은
// 9/12 릴리즈 범위 밖이다.
//
// 근거: 결정 로그 "v0.1 계측 미도입 — track()을 no-op으로 두고 도구는
//       v0.1.1에서 재선정"(2026-09-09 확정). 그때까지 완주율 · 재도전율 등
//       KPI는 측정되지 않는다.
//
// TODO: v0.1.1에서 쿠키 없는 계측 도구를 재선정해 이 함수 안에서만 연결한다.
//       호출부(이벤트 5종)는 그대로라 교체 비용이 이 파일에 갇혀 있다.
//       도구를 붙일 때 아래 테스트도 함께 되살린다 (지금은 빈 함수라
//       무엇을 단언해도 항진명제가 되어 삭제했다):
//         - 로컬 개발 환경에서는 전송하지 않는다
//         - 이벤트 이름과 속성을 한 페이로드로 보낸다
//         - 도구가 없거나 예외를 던져도 앱으로 새지 않는다(fire-and-forget)

/** 계측 문서의 이벤트 표가 단일 출처. 오타를 컴파일 시점에 잡는다. */
export type TrackEvent =
  | 'practice_start'
  | 'practice_complete'
  | 'practice_abort'
  | 'retry'
  | 'offset_changed';

type TrackProps = Record<string, string | number | boolean>;

/**
 * 이벤트 1건 전송.
 *
 * 지금은 의도적으로 아무 일도 하지 않는다. 도구를 붙인 뒤에도 이 함수는
 * 절대 던지지 않아야 한다 — 계측 실패가 연습을 막아서는 안 된다.
 */
export function track(_name: TrackEvent, _props: TrackProps = {}): void {
  // 의도적 no-op. 위 TODO 참조.
}
