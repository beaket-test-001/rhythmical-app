// 판정 · 스케줄러 상수 — 사양서 §5, Tech Spec §1이 단일 출처.
// 허용 오차는 하드코딩 금지 원칙에 따라 여기서만 정의한다.

export const PERFECT_WINDOW_MS = 50;
export const GOOD_WINDOW_MS = 120;

// BPM 범위 · 기본값은 패턴별 필드(bpmMin / bpmMax / bpmDefault)가 단일 출처 — patterns.ts 참조
export const COUNT_IN_BARS = 1; // 카운트인 1마디
export const PLAY_BARS = 4; // 연습 4마디
export const DEBOUNCE_MS = 60; // 채터링 방지

export const OFFSET_MIN_MS = -200;
export const OFFSET_MAX_MS = 200;

export const LOOKAHEAD_INTERVAL_MS = 25; // 스케줄러 타이머 주기
export const SCHEDULE_AHEAD_S = 0.1; // 선행 예약 윈도우

// localStorage 키 — Tech Spec §2. 스키마가 바뀌면 v2로 올린다.
export const RECORDS_KEY = 'rhythmical.records.v1';
export const SETTINGS_KEY = 'rhythmical.settings.v1';
