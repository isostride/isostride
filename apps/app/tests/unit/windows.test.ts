import { describe, expect, it } from 'vitest';
import type { Samples, Series } from '@/lib/kernel';
import { buildWindows } from '@/lib/prepare';

/** A synthetic run of `seconds` 1 s samples, every metric from a function of t. */
function synthetic(seconds: number, f: (t: number) => Partial<Record<string, number | null>>, every: (t: number) => number = () => 1): Samples {
  const values: Record<string, Series> = {};
  const s: Samples = { t: [], distance: [], lat: [], lon: [], values };
  for (let t = 0; t < seconds; t += every(t)) {
    const v = f(t);
    const i = s.t.length;
    s.t.push(t);
    s.distance.push(null); s.lat.push(null); s.lon.push(null);
    for (const k of Object.keys(v)) (values[k] ??= new Array<number | null>(i).fill(null))[i] = v[k] ?? null;
  }
  for (const k of Object.keys(values)) values[k] = Array.from({ length: s.t.length }, (_, j) => values[k][j] ?? null);
  return s;
}

describe('10 s windows', () => {
  it('10 s window means', () => {
    // Speed rises by 0.01 m/s per second, heart rate is 120 + t % 10: means are hand-computed.
    const w = buildWindows(synthetic(600, (t) => ({ speed: 3 + t * 0.01, heartRate: 120 + (t % 10) })));
    expect(w.start).toHaveLength(60);
    expect(w.n.every((n) => n === 10)).toBe(true);
    // Window 0: t 0..9 → speed mean 3.045, heart rate mean 124.5.
    expect((w.values.speed?.[0] ?? null)).toBeCloseTo(3.045, 3);
    expect((w.values.heartRate?.[0] ?? null)).toBeCloseTo(124.5, 3);
    // Window 59: t 590..599 → speed 3 + 5.945 = 8.945.
    expect((w.values.speed?.[59] ?? null)).toBeCloseTo(8.945, 3);
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

describe('Stops found by time', () => {
  it('Smart recording keeps its moving windows', () => {
    // A record every 1, 3, 5 or 7 s (as Garmin's Smart recording), at 3 m/s, with a pause of 60 s
    // from 300 s without records (the watch paused).
    const gaps = [1, 3, 5, 7];
    let k = 0;
    const every = (t: number) => (t >= 290 && t < 300 ? 70 : gaps[k++ % gaps.length]);
    const s = synthetic(600, () => ({ speed: 3, heartRate: 150 }), every);
    expect(s.t.some((t, i) => i > 0 && t - s.t[i - 1] === 7)).toBe(true);
    const w = buildWindows(s);
    const at = (sec: number) => Math.floor(sec / 10);
    // The running is moving, though most of its windows hold fewer than 5 records.
    const running = w.start.map((_, i) => i).filter((i) => (i < at(290) || i > at(372)) && i < w.start.length - 1);
    expect(running.filter((i) => w.n[i] < 5).length).toBeGreaterThan(10);
    for (const i of running) expect(w.flags.stopped[i], `window ${i}`).toBe(false);
    // The pause is a stop: its windows hold no records past the 10 s the last one before it covers.
    for (let i = at(310); i < at(360); i++) expect(w.flags.stopped[i], `window ${i}`).toBe(true);
  });
});
