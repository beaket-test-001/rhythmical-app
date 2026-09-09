// 패턴 5종 정적 데이터 — Tech Spec §9가 단일 출처.
import type { Pattern } from '../types';

/** 셋잇단 헬퍼 — 부동소수점 하드코딩(0.333…)을 피한다. */
const T = (k: number, j: number) => k + j / 3;

export const PATTERNS: Pattern[] = [
  {
    id: 'quarter',
    name: '4분음표',
    timeSignature: [4, 4],
    bpmDefault: 80,
    bpmMin: 60,
    bpmMax: 120,
    taps: [0, 1, 2, 3],
    accents: [0],
  },
  {
    id: 'eighth',
    name: '8분음표',
    timeSignature: [4, 4],
    bpmDefault: 80,
    bpmMin: 60,
    bpmMax: 120,
    taps: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
    accents: [0],
  },
  {
    id: 'triplet',
    name: '셋잇단',
    timeSignature: [4, 4],
    bpmDefault: 70,
    bpmMin: 60,
    bpmMax: 100, // 인접 간격 200ms 확보 — 판정 모호성 방지
    taps: [0, 1, 2, 3].flatMap((k) => [T(k, 0), T(k, 1), T(k, 2)]),
    accents: [0],
  },
  {
    id: 'syncopation',
    name: '싱커페이션',
    timeSignature: [4, 4],
    bpmDefault: 75,
    bpmMin: 60,
    bpmMax: 120,
    taps: [0, 1.5, 2, 3.5],
    accents: [0],
  },
  {
    id: 'eighth-mix',
    name: '8비트 믹스',
    timeSignature: [4, 4],
    bpmDefault: 80,
    bpmMin: 60,
    bpmMax: 120,
    taps: [0, 1, 1.5, 2, 3, 3.5],
    accents: [0],
  },
];

/** id로 패턴을 찾는다. 없으면 undefined. */
export const findPattern = (id: string): Pattern | undefined =>
  PATTERNS.find((p) => p.id === id);
