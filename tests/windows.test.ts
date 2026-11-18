import { describe, expect, it } from 'vitest';
import type { Samples, Series } from '@/lib/ingest/parseFit';
import { buildWindows } from '@/lib/prepare/windows';

/** A synthetic run of `seconds` 1 s samples, every metric from a function of t. */
function synthetic(seconds: number, f: (t: number) => Partial<Record<keyof Samples, number | null>>): Samples {
  const s = {
    t: [], speed: [], heartRate: [], cadence: [], groundContactTime: [], verticalOscillation: [], stepLength: [],
    power: [], altitude: [], lat: [], lon: [], temperature: [], effortPace: [], legSpringStiffness: [], distance: [],
  } as unknown as Samples;
  for (let t = 0; t < seconds; t++) {
    const v = f(t);
    s.t.push(t);
    for (const k of Object.keys(s) as (keyof Samples)[]) {
      if (k === 't') continue;
      (s[k] as Series).push(v[k] ?? null);
    }
  }
  return s;
}

describe('10 s windows', () => {
  it('10 s window means', () => {
    // Speed rises by 0.01 m/s per second, heart rate is 120 + t % 10: means are hand-computed.
    const w = buildWindows(synthetic(600, (t) => ({ speed: 3 + t * 0.01, heartRate: 120 + (t % 10) })));
    expect(w.start).toHaveLength(60);
    expect(w.n.every((n) => n === 10)).toBe(true);
    // Window 0: t 0..9 → speed mean 3.045, heart rate mean 124.5.
    expect(w.speed[0]).toBeCloseTo(3.045, 3);
    expect(w.heartRate[0]).toBeCloseTo(124.5, 3);
    // Window 59: t 590..599 → speed 3 + 5.945 = 8.945.
    expect(w.speed[59]).toBeCloseTo(8.945, 3);
  });
});

describe('Window quality flags', () => {
  it('Quality flags set', () => {
    // 40 min run at 3.3 m/s; stops 12:00–12:30, climbs 20:00–21:00 (effort pace 10% above pace),
    // loses heart rate 30:00–30:30.
    const w = buildWindows(
      synthetic(2400, (t) => {
        const stopped = t >= 720 && t < 750;
        const climbing = t >= 1200 && t < 1260;
        const noHr = t >= 1800 && t < 1830;
        const speed = stopped ? 0 : 3.3;
        return {
          speed,
          heartRate: noHr ? null : 150,
          effortPace: stopped ? 0 : climbing ? speed * 1.1 : speed * 1.01,
        };
      }),
    );
    const at = (s: number) => s / 10;
    // The 10 s windows in the first 150 s of the run are flagged "first 150 s".
    expect(w.flags.first150.slice(0, 15).every(Boolean)).toBe(true);
    expect(w.flags.first150[15]).toBe(false);
    expect(w.flags.stopped[at(720)]).toBe(true);
    expect(w.flags.stopped[at(740)]).toBe(true);
    expect(w.flags.stopped[at(760)]).toBe(false);
    expect(w.flags.grade[at(1200)]).toBe(true);
    expect(w.flags.grade[at(1250)]).toBe(true);
    expect(w.flags.grade[at(1300)]).toBe(false); // 1% difference is within 4%
    expect(w.flags.missingSignal[at(1800)]).toEqual(['heartRate']);
    expect(w.flags.missingSignal[at(1900)]).toBeNull();
  });
});
