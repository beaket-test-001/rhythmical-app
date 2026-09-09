import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadRecords,
  saveRecord,
  loadSettings,
  saveSettings,
} from '../src/storage';
import { RECORDS_KEY, SETTINGS_KEY, OFFSET_MAX_MS, OFFSET_MIN_MS } from '../src/constants';
import type { PatternId } from '../src/types';

/** 목록 화면과 같은 경로로 최고 기록을 읽는다. */
const bestAccuracy = (patternId: PatternId) =>
  loadRecords().find((r) => r.patternId === patternId)?.bestAccuracy ?? null;

/** 최소한의 인메모리 Storage. 저장 실패 시나리오를 흉내내기 위해 직접 만든다. */
function fakeStorage(failOnWrite = false) {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (failOnWrite) throw new DOMException('QuotaExceededError');
      map.set(k, v);
    },
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  };
}

const seed = (key: string, raw: string) => localStorage.setItem(key, raw);

beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));

describe('기록 저장', () => {
  it('저장된 기록이 없으면 빈 배열', () => {
    expect(loadRecords()).toEqual([]);
    expect(bestAccuracy('quarter')).toBeNull();
  });

  it('기록을 저장하고 다시 읽는다', () => {
    expect(saveRecord('quarter', 87.5)).toBe(true); // 첫 기록 = 갱신
    expect(bestAccuracy('quarter')).toBe(87.5);
    expect(loadRecords()).toHaveLength(1);
  });

  it('최고 기록을 넘어설 때만 갱신한다', () => {
    saveRecord('quarter', 87.5);
    expect(saveRecord('quarter', 80)).toBe(false);
    expect(bestAccuracy('quarter')).toBe(87.5);
    expect(saveRecord('quarter', 92.5)).toBe(true);
    expect(bestAccuracy('quarter')).toBe(92.5);
  });

  it('같은 기록으로는 갱신되지 않는다', () => {
    saveRecord('quarter', 87.5);
    expect(saveRecord('quarter', 87.5)).toBe(false);
  });

  it('패턴별로 따로 기록한다', () => {
    saveRecord('quarter', 90);
    saveRecord('eighth', 70);
    expect(bestAccuracy('quarter')).toBe(90);
    expect(bestAccuracy('eighth')).toBe(70);
    expect(loadRecords()).toHaveLength(2);
  });

  it('범위 밖 정확도는 저장하지 않는다 — 읽기가 버릴 값이라 배지만 뜨는 상태를 막는다', () => {
    expect(saveRecord('quarter', 150)).toBe(false);
    expect(saveRecord('quarter', -1)).toBe(false);
    expect(saveRecord('quarter', NaN)).toBe(false);
    expect(bestAccuracy('quarter')).toBeNull();
    expect(loadRecords()).toEqual([]);
  });

  it('저장 시각을 ISO 8601로 남긴다', () => {
    saveRecord('quarter', 90);
    expect(Date.parse(loadRecords()[0]!.updatedAt)).not.toBeNaN();
  });
});

describe('저장소 오염 방어 — localStorage는 사용자가 편집할 수 있다', () => {
  it('JSON이 깨져 있으면 빈 값으로 취급한다', () => {
    seed(RECORDS_KEY, '{ 깨진 JSON');
    expect(loadRecords()).toEqual([]);
  });

  it('배열이 아니면 빈 값으로 취급한다', () => {
    seed(RECORDS_KEY, '{"patternId":"quarter"}');
    expect(loadRecords()).toEqual([]);
  });

  it('모르는 패턴 · 형식이 어긋난 항목은 버린다', () => {
    seed(
      RECORDS_KEY,
      JSON.stringify([
        { patternId: 'quarter', bestAccuracy: 90, updatedAt: '2026-09-09T00:00:00.000Z' },
        { patternId: '없는패턴', bestAccuracy: 90, updatedAt: '2026-09-09T00:00:00.000Z' },
        { patternId: 'eighth', bestAccuracy: '90', updatedAt: '2026-09-09T00:00:00.000Z' },
        { patternId: 'triplet', bestAccuracy: 150, updatedAt: '2026-09-09T00:00:00.000Z' },
        { patternId: 'syncopation', bestAccuracy: 90, updatedAt: '어제' },
        null,
      ]),
    );
    expect(loadRecords().map((r) => r.patternId)).toEqual(['quarter']);
  });

  it('저장이 실패해도(사파리 프라이벳 등) 예외를 던지지 않는다', () => {
    vi.stubGlobal('localStorage', fakeStorage(true));
    expect(() => saveRecord('quarter', 90)).not.toThrow();
    expect(saveRecord('quarter', 90)).toBe(false); // 갱신되지 않았음을 알린다
  });
});

describe('저장 형식 보존 — 1.0.0부터 기록을 깨는 변경은 major다', () => {
  it('이 빌드가 모르는 패턴의 기록을 지우지 않는다', () => {
    // 패턴 id 이름을 바꾸는 minor 변경만으로 최고 기록이 사라지면,
    // "형식을 깨는 변경은 major" 약속을 코드가 지키지 못한다.
    seed(
      RECORDS_KEY,
      JSON.stringify([
        { patternId: 'shuffle', bestAccuracy: 88, updatedAt: '2026-09-09T00:00:00.000Z' },
      ]),
    );
    saveRecord('quarter', 90);

    const stored = JSON.parse(localStorage.getItem(RECORDS_KEY)!);
    expect(stored).toContainEqual(
      expect.objectContaining({ patternId: 'shuffle', bestAccuracy: 88 }),
    );
    expect(bestAccuracy('quarter')).toBe(90); // 새 기록도 정상 저장
  });

  it('읽지 못하는 항목도 남긴다', () => {
    seed(RECORDS_KEY, JSON.stringify([{ 알수없는: '형식' }, null]));
    saveRecord('quarter', 90);

    const stored = JSON.parse(localStorage.getItem(RECORDS_KEY)!);
    expect(stored).toHaveLength(3); // 기존 2개 + 새 기록
    expect(loadRecords()).toHaveLength(1); // 읽을 때는 걸러진다
  });

  it('같은 패턴의 기록은 덮어쓴다 — 중복이 쌓이지 않는다', () => {
    saveRecord('quarter', 70);
    saveRecord('quarter', 90);
    const stored = JSON.parse(localStorage.getItem(RECORDS_KEY)!);
    expect(stored).toHaveLength(1);
    expect(bestAccuracy('quarter')).toBe(90);
  });
});

describe('설정 저장', () => {
  it('저장된 설정이 없으면 지연 보정 기본값 0', () => {
    expect(loadSettings()).toEqual({ offsetMs: 0 });
  });

  it('설정을 저장하고 다시 읽는다', () => {
    saveSettings({ offsetMs: -80 });
    expect(loadSettings()).toEqual({ offsetMs: -80 });
  });

  it('허용 범위를 벗어난 보정값은 범위 안으로 잘라낸다', () => {
    saveSettings({ offsetMs: 9999 });
    expect(loadSettings().offsetMs).toBe(OFFSET_MAX_MS);
    saveSettings({ offsetMs: -9999 });
    expect(loadSettings().offsetMs).toBe(OFFSET_MIN_MS);
  });

  it('깨진 설정 · 숫자가 아닌 보정값은 기본값으로 되돌린다', () => {
    seed(SETTINGS_KEY, '깨짐');
    expect(loadSettings()).toEqual({ offsetMs: 0 });
    seed(SETTINGS_KEY, '{"offsetMs":"많이"}');
    expect(loadSettings()).toEqual({ offsetMs: 0 });
    seed(SETTINGS_KEY, '{"offsetMs":null}');
    expect(loadSettings()).toEqual({ offsetMs: 0 });
  });

  it('NaN 보정값을 저장해도 기본값으로 되돌아온다', () => {
    saveSettings({ offsetMs: NaN }); // JSON.stringify는 NaN을 null로 쓴다
    expect(loadSettings().offsetMs).toBe(0);
  });

  it('직접 편집된 범위 밖 값도 읽을 때 잘라낸다', () => {
    seed(SETTINGS_KEY, '{"offsetMs":9999}');
    expect(loadSettings().offsetMs).toBe(OFFSET_MAX_MS);
    seed(SETTINGS_KEY, '{"offsetMs":-9999}');
    expect(loadSettings().offsetMs).toBe(OFFSET_MIN_MS);
  });

  it('저장이 실패해도 예외를 던지지 않는다', () => {
    vi.stubGlobal('localStorage', fakeStorage(true));
    expect(() => saveSettings({ offsetMs: 50 })).not.toThrow();
  });
});
