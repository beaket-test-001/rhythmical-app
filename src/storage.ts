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
// 형식이 어긋난 항목은 읽을 때 버리고, 저장할 때 그대로 정리된다. 이 앱이
// 유일한 기록 작성자라 읽을 수 없는 항목을 남겨 둘 이유가 없다.
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
export function bestAccuracy(patternId: PatternId): number | null {
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

  const records = loadRecords();
  const previous = records.find((r) => r.patternId === patternId);
  if (previous && previous.bestAccuracy >= accuracy) return false;

  const updated: StoredRecord = {
    patternId,
    bestAccuracy: accuracy,
    updatedAt: new Date().toISOString(),
  };
  const next = previous
    ? records.map((r) => (r.patternId === patternId ? updated : r))
    : [...records, updated];

  return writeJson(RECORDS_KEY, next);
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
