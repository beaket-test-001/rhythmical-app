import { describe, it, expect } from 'vitest';
import { createBeatScheduler, isAccentBeat, totalBeats } from '../src/audio/metronome';
import { COUNT_IN_BARS, PLAY_BARS, SCHEDULE_AHEAD_S } from '../src/constants';

describe('isAccentBeat', () => {
  it('마디 첫 박이 액센트다 (기본 accents [0])', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => isAccentBeat(i, 4, [0]))).toEqual([
      true, false, false, false, true, false,
    ]);
  });

  it('액센트 위치는 마디 안의 박 번호로 해석한다', () => {
    expect(isAccentBeat(6, 4, [2])).toBe(true); // 두 번째 마디의 3번째 박
    expect(isAccentBeat(5, 4, [2])).toBe(false);
  });
});

describe('totalBeats', () => {
  it('카운트인 + 연습 마디의 총 박 수', () => {
    expect(totalBeats(4)).toBe((COUNT_IN_BARS + PLAY_BARS) * 4); // 20
  });
});

describe('createBeatScheduler — 룩어헤드 (§5)', () => {
  const opts = { startTime: 10, bpm: 60, beatsPerBar: 4, accents: [0] }; // 1박 = 1초

  it('선행 예약 윈도우 안의 박만 내보낸다', () => {
    const s = createBeatScheduler(opts);
    // now=10 → 10.1초 앞까지 예약 → 첫 박(10초)만 해당
    expect(s.pull(10).map((b) => b.time)).toEqual([10]);
    expect(s.pull(10)).toEqual([]); // 같은 박을 두 번 내보내지 않는다
    expect(s.pull(10.5)).toEqual([]); // 다음 박(11초)은 아직 윈도우 밖
    expect(s.pull(11).map((b) => b.time)).toEqual([11]);
  });

  it('타이머가 늦게 깨어나면 밀린 박을 한 번에 따라잡는다', () => {
    const s = createBeatScheduler(opts);
    const beats = s.pull(13); // 10 ~ 13.1초 구간
    expect(beats.map((b) => b.time)).toEqual([10, 11, 12, 13]);
    expect(beats.map((b) => b.index)).toEqual([0, 1, 2, 3]);
  });

  it('BPM이 박 간격에 반영된다', () => {
    const s = createBeatScheduler({ ...opts, bpm: 120 }); // 1박 = 0.5초
    expect(s.pull(11).map((b) => b.time)).toEqual([10, 10.5, 11]);
  });

  it('액센트 정보가 박에 함께 실린다', () => {
    const s = createBeatScheduler(opts);
    expect(s.pull(14).map((b) => b.isAccent)).toEqual([
      true, false, false, false, true,
    ]);
  });

  it('총 박 수를 넘어서면 더 내보내지 않는다', () => {
    const s = createBeatScheduler(opts); // 20박, 60BPM → 마지막 박 29초
    expect(s.pull(100).length).toBe(20);
    expect(s.pull(200)).toEqual([]);
    expect(s.isDone()).toBe(true);
  });

  it('선행 예약 윈도우는 상수를 따른다', () => {
    const s = createBeatScheduler({ ...opts, startTime: 0 });
    // 첫 박은 0초. now가 -SCHEDULE_AHEAD_S 직전이면 아직 안 나온다
    expect(s.pull(-SCHEDULE_AHEAD_S - 0.001)).toEqual([]);
    expect(s.pull(-SCHEDULE_AHEAD_S + 0.001).map((b) => b.time)).toEqual([0]);
  });
});

describe('createBeatScheduler — 시각 표시용 조회', () => {
  const opts = { startTime: 0, bpm: 60, beatsPerBar: 4, accents: [0] };

  it('now 시점에 울린 가장 최근 박을 돌려준다', () => {
    const s = createBeatScheduler(opts);
    s.pull(100); // 전 구간 예약
    expect(s.beatAt(-0.5)).toBeNull(); // 시작 전
    expect(s.beatAt(0)!.index).toBe(0);
    expect(s.beatAt(2.7)!.index).toBe(2);
    expect(s.beatAt(19)!.index).toBe(19); // 마지막 박
    expect(s.beatAt(100)!.index).toBe(19);
  });
});
