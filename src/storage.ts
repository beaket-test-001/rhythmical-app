// localStorage 래퍼 — Tech Spec §2.
//
// localStorage는 사용자가 직접 편집할 수 있고 다른 버전의 앱이 쓴 값이 남아
// 있을 수도 있다. 그래서 읽을 때마다 형식을 검증하고, 어긋난 항목은 조용히
// 버린다. 연습 기록은 잃어도 되는 데이터라 앱을 멈추는 편이 더 나쁘다.
//
// 저장 실패(사파리 프라이빗 모드, 용량 초과)도 예외를 밖으로 흘리지 않는다.
// 사양의 "저장 실패는 무시하고 앞으로 진행(기록만 비활성)" 요구에 따른다.
//
// TODO: 탭 간 동시 저장은 마지막 쓰기가 이긴다(읽기-수정-쓰기 경쟁). 1인 연습
//       도구라 MVP에서는 허용한다. 문제가 되면 storage 이벤트로 재읽기.
//
// 읽지 못하는 항목은 읽을 때만 걸러내고 저장할 때는 그대로 남긴다.
// v1.0.0부터 "저장된 기록의 형식을 깨는 변경은 major"가 약속인데, 저장 시
// 정리해 버리면 패턴 id 이름을 바꾸는 minor 변경만으로 최고 기록이 조용히
// 사라져 그 약속을 코드가 지키지 못한다.
import { OFFSET_MAX_MS, OFFSET_MIN_MS, RECORDS_KEY, SETTINGS_KEY } from './constants';
import { PATTERNS } from './core/patterns';
import type { PatternId, Settings, StoredRecord } from './types';

const DEFAULT_SETTINGS: Settings = { offsetMs: 0 };

const isPatternId = (v: unknown): v is PatternId =>
  typeof v === 'string' && PATTERNS.some((p) => p.id === v);

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

/** 정확도로 쓸 수 있는 값인지. 읽기·쓰기가 같은 기준을 써야 유령 기록이 안 생긴다. */
const isValidAccuracy = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;

/** 파싱에 실패하면 null. 저장소가 아예 없는 환경(SSR·프라이빗 모드)도 여기서 걸린다. */
function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

/** 저장 성공 여부. 실패해도 예외를 던지지 않는다. */
function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** 저장된 값이 이 패턴의 항목인지. 형식이 어긋나도 patternId만 맞으면 교체 대상이다. */
function isEntryFor(value: unknown, patternId: PatternId): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>)['patternId'] === patternId
  );
}

/** 저장된 값 하나가 StoredRecord로 쓸 수 있는지. */
function isStoredRecord(v: unknown): v is StoredRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    isPatternId(r['patternId']) &&
    isValidAccuracy(r['bestAccuracy']) &&
    typeof r['updatedAt'] === 'string' &&
    Number.isFinite(Date.parse(r['updatedAt']))
  );
}

/** 패턴별 최고 기록. 형식이 어긋난 항목은 버린다. */
export function loadRecords(): StoredRecord[] {
  const parsed = readJson(RECORDS_KEY);
  return Array.isArray(parsed) ? parsed.filter(isStoredRecord) : [];
}

/** 해당 패턴의 최고 정확도. 기록이 없으면 null. */
function bestAccuracy(patternId: PatternId): number | null {
  return loadRecords().find((r) => r.patternId === patternId)?.bestAccuracy ?? null;
}

/**
 * 최고 기록을 갱신한다.
 * @returns 실제로 갱신되었는지. 결과 화면의 "최고 기록 갱신" 배지에 쓴다.
 *          저장에 실패하면 갱신되지 않은 것으로 본다.
 */
export function saveRecord(patternId: PatternId, accuracy: number): boolean {
  // 읽기가 버릴 값을 저장하면 "갱신!" 배지는 뜨는데 목록에는 "—"가 남는다.
  // 두 경로가 같은 기준을 쓰게 해 이 어긋남을 막는다.
  if (!isValidAccuracy(accuracy)) return false;

  const previous = bestAccuracy(patternId);
  if (previous !== null && previous >= accuracy) return false;

  const updated: StoredRecord = {
    patternId,
    bestAccuracy: accuracy,
    updatedAt: new Date().toISOString(),
  };

  // 원본 배열 위에 덮어쓴다. 지금 바꾸는 패턴의 항목만 교체하고 나머지는
  // 해석 여부와 무관하게 그대로 남긴다.
  const stored = readJson(RECORDS_KEY);
  const others = Array.isArray(stored)
    ? stored.filter((entry) => !isEntryFor(entry, patternId))
    : [];

  return writeJson(RECORDS_KEY, [...others, updated]);
}

/** 지연 보정 설정. 값이 없거나 어긋나면 기본값(0ms). */
export function loadSettings(): Settings {
  const parsed = readJson(SETTINGS_KEY);
  if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SETTINGS;

  const offsetMs = (parsed as Record<string, unknown>)['offsetMs'];
  if (typeof offsetMs !== 'number' || !Number.isFinite(offsetMs)) {
    return DEFAULT_SETTINGS;
  }
  return { offsetMs: clamp(offsetMs, OFFSET_MIN_MS, OFFSET_MAX_MS) };
}

/** 설정을 저장한다. 실패해도 예외를 던지지 않는다(사양 §2). */
export function saveSettings(settings: Settings): void {
  writeJson(SETTINGS_KEY, {
    offsetMs: clamp(settings.offsetMs, OFFSET_MIN_MS, OFFSET_MAX_MS),
  });
}
