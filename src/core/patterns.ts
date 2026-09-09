// 패턴 5종 정적 데이터 — Tech Spec §9가 단일 출처.
import type { Pattern } from '../types';

/** 셋잇단 j번째 음의 박 위치. 부동소수점 하드코딩(0.333…)을 피한다. */
const tripletBeat = (beat: number, index: number) => beat + index / 3;

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
    // 상한 100BPM에서 인접 간격 200ms. 고정 ±120ms 창은 겹치므로
    // 판정은 동적 윈도우(Tech Spec §3.6)로 좁혀 모호성을 없앤다.
    bpmMax: 100,
    taps: [0, 1, 2, 3].flatMap((beat) =>
      [0, 1, 2].map((i) => tripletBeat(beat, i)),
    ),
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
