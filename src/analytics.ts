// 계측 래퍼 — Analytics 문서.
//
// 도구 교체에 대비해 track() 하나로 통일한다. 전송은 fire-and-forget이라
// 실패하거나 오프라인이어도 연습을 막지 않는다. 개인정보는 어떤 이벤트에도
// 넣지 않는다 — 속성은 패턴 id · BPM · 집계 수치뿐이다.
//
// 도구는 Vercel Web Analytics. 호스팅이 주입하는 전역 큐(window.va)를 직접
// 쓰므로 별도 패키지가 필요 없다. 스크립트가 없는 환경(로컬 · 다른 호스팅)에서는
// 조용히 아무 일도 하지 않는다.

/** 계측 문서의 이벤트 표가 단일 출처. 오타를 컴파일 시점에 잡는다. */
export type TrackEvent =
  | 'practice_start'
  | 'practice_complete'
  | 'practice_abort'
  | 'retry'
  | 'offset_changed';

type TrackProps = Record<string, string | number | boolean>;

declare global {
  interface Window {
    va?: (event: 'event', payload: { name: string } & TrackProps) => void;
  }
}

/** 이벤트 1건 전송. 실패는 무시한다. */
export function track(name: TrackEvent, props: TrackProps = {}): void {
  if (import.meta.env.DEV) return; // 로컬 개발 환경에서는 전송하지 않는다
  try {
    window.va?.('event', { name, ...props });
  } catch {
    // 계측이 앱을 멈추게 두지 않는다
  }
}
