// 계측 래퍼 — Analytics 문서.
//
// v0.1은 이벤트를 수집하지 않는다. 호스팅을 GitHub Pages로 정하면서 호스팅
// 내장 계측(Vercel Web Analytics)을 쓸 수 없게 됐고, 새 도구를 붙이는 것은
// 릴리즈 범위 밖이다. Analytics 문서의 다음 조항을 따른다.
//
//   "만약 구현 중 커스텀 이벤트가 막히면: track()을 no-op으로 두고 그대로
//    릴리즈, 도구 교체는 v0.1.1에서(래퍼가 그 전제로 설계됨)"
//
// TODO: v0.1.1에서 쿠키 없는 계측 도구를 재선정해 이 함수 안에서만 연결한다.
//       호출부(이벤트 5종)는 그대로 두어 교체 비용을 여기에 가둔다.
//       그때까지 KPI(완주율 · 재도전율 · 방문당 연습 수)는 측정되지 않는다.

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
