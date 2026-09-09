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

/**
 * 의견 보내기 창구.
 *
 * 지금 GitHub Issues를 쓰는 이유는, 창구의 종류보다 창구가 아예 없는 것이
 * 문제이기 때문이다 — 계측도 에러 리포팅도 없어서 앱이 특정 기기에서
 * 완전히 깨져 있어도 알아낼 경로가 하나도 없다.
 *
 * TODO: GitHub 계정이 필요해 연습만 하러 온 사용자에게는 사실상 닫힌
 *       창구다. 계정 없이 보낼 수 있는 폼이 준비되면 이 값만 바꾼다.
 *       그때까지는 창구가 있다는 완료 조건을 문자 그대로만 충족한다.
 */
export const FEEDBACK_URL =
  'https://github.com/beaket-test-001/rhythmical-app/issues/new';
