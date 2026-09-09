// 앱 전역 데이터 모델 — Tech Spec §2.

/** 구현된 패턴 식별자의 닫힌 집합. 오타를 컴파일 시점에 잡는다. */
export type PatternId =
  | 'quarter'
  | 'eighth'
  | 'triplet'
  | 'syncopation'
  | 'eighth-mix';

/** 리듬 패턴. taps는 한 마디 안의 탭 위치(박 단위 오프셋, 0 = 마디 첫 박). */
export interface Pattern {
  id: PatternId;
  name: string; // 표시명(한국어)
  // TODO: [4, 4] 고정. 다른 박자표 지원은 로드맵 DB 등록 대상이다
  timeSignature: [number, number];
  bpmDefault: number;
  bpmMin: number;
  bpmMax: number;
  taps: number[]; // 예: 4분음표 [0,1,2,3]
  accents: number[]; // 액센트 박 위치(메트로놈 클릭 강조)
}

export type Verdict = 'perfect' | 'good' | 'miss';

/** 기대 탭 1개에 대한 판정 결과. */
export interface TapJudgment {
  expectedTime: number; // AudioContext 시간(초)
  tapTime: number | null; // 매칭된 탭 시각, 미입력이면 null
  deltaMs: number | null; // tap - expected (지연 보정 후)
  verdict: Verdict;
}

/** 연습 1세션의 집계 결과. */
export interface SessionResult {
  patternId: PatternId;
  bpm: number;
  accuracy: number; // 0~100, 소수 1자리
  counts: { perfect: number; good: number; miss: number };
  extraTaps: number; // 기대 탭과 매칭되지 않은 입력 수(정확도 분모에 불포함)
  playedAt: string; // ISO 8601
}

export interface StoredRecord {
  patternId: PatternId;
  bestAccuracy: number;
  updatedAt: string;
}

export interface Settings {
  offsetMs: number; // 지연 보정, 기본 0
}
