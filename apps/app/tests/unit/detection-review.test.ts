import { describe, expect, it } from 'vitest';
import { fastestOver, isAutoLapRun, ruleOf, stretchSubject, type RefPoint } from '@/lib/blocks';
import { buildInstance, detectRouteSegments, findPasses, ruleSegments } from '@/lib/detection';
import type { TrackPoint } from '@/lib/geo';
import { pauseGap, type RunFile } from '@/lib/kernel';
import { rowFor, steadyDef, syntheticRun } from '../support/synthetic';

/** A point `north` and `east` metres from a made-up corner, heading `heading`. */
const M = 111_195;
const at = (north: number, east: number, heading: number): RefPoint => ({ lat: 41.39 + north / M, lon: 2.2 + east / (M * Math.cos((41.39 * Math.PI) / 180)), heading });
const track = (pts: RefPoint[], from = 0): TrackPoint[] => pts.map((p, i) => ({ ...p, d: (from + i) * 10, t: (from + i) * 3 }));

/**
 * The review of the segments' detection (26 Nov 2026, the runner's "zmergowane, zrob kolejna iteracje"): each
 * fault with the behaviour that replaces it.
 */
describe('Detection reviewed', () => {
  it('A pass up to a turnaround, and each lap of a short loop', () => {
    // 600 m north to a turnaround. The run goes out 4 m beside the reference and comes back on it: the nearest
    // point of the last 200 m was one of the way back, and the pass was missed.
    const ref = Array.from({ length: 61 }, (_, i) => at(i * 10, 0, 0));
    const out = Array.from({ length: 60 }, (_, i) => at(i * 10 + 5, 4, 0));
    const back = Array.from({ length: 61 }, (_, i) => at(600 - i * 10, 0, 180));
    const passes = findPasses(ref, track([...out, ...back]));
    expect(passes).toHaveLength(1);
    expect(passes[0].share).toBeGreaterThan(0.95);
    // Four laps of a loop of 300 m, every other lap 4 m further out; the reference its first 200 m. A point a lap
    // ahead lies within the 400 m looked ahead, and nearer: two laps read as one pass.
    const r = 300 / (2 * Math.PI);
    const lap = (k: number, n: number) => Array.from({ length: n }, (_, i) => { const a = (i * 10) / r; const rr = r + (k % 2 ? 0 : 4); return at(rr * Math.sin(a), r - rr * Math.cos(a), (a * 180) / Math.PI + 90 - 90); });
    const loop = findPasses(lap(1, 21), track([0, 1, 2, 3].flatMap((k) => lap(k, 30))));
    expect(loop).toHaveLength(4);
    expect(loop.every((p) => p.to - p.from <= 22)).toBe(true);
  });

  it('The fastest stretch of a time by its speed', () => {
    // Samples 5 and 30 s apart: 35 s covering 185 m (5.3 m/s) hold a stretch of 30 s covering 180 m (6 m/s).
    expect(fastestOver([0, 5, 35], [0, 5, 185], 'time', 30)).toMatchObject({ from: 5, to: 35 });
  });

  it('A run recorded smart by the share of its gaps', () => {
    // An hour at 5:00/km, a sample kept every 1 to 7 s (just over half the gaps of a second): recorded smart. By
    // the median gap it was a run recorded every second, all its longer gaps pauses.
    const whole = syntheticRun(3600, () => ({ speed: 1000 / 300, heartRate: 150 }));
    const gaps = [1, 1, 7, 1, 6, 1, 1, 5, 1, 4];
    const keep: number[] = [];
    for (let i = 0, k = 0; i < 3600; i += gaps[k++ % gaps.length]) keep.push(i);
    const pick = <T,>(xs: T[]) => keep.map((i) => xs[i]);
    const s = whole.samples;
    const smart: RunFile = { ...whole, samples: { t: pick(s.t), distance: pick(s.distance), lat: pick(s.lat), lon: pick(s.lon), values: Object.fromEntries(Object.entries(s.values).map(([k, v]) => [k, pick(v ?? [])])) } };
    expect(pauseGap(smart.samples.t)).toBe(10);
    // Its pace is the pace it was run at (gaps over 5 s left out of the moving time read 3:21/km).
    expect(stretchSubject(smart, 0, 3600).pace!).toBeGreaterThan(297);
    expect(stretchSubject(smart, 0, 3600).pace!).toBeLessThan(303);
    // A watch recording every second with a pause and a few lost samples stays one.
    expect(pauseGap([...Array.from({ length: 600 }, (_, i) => i), ...Array.from({ length: 600 }, (_, i) => 700 + i * 1)].filter((x) => x % 97 !== 5))).toBe(2);
  });

  it('The conditions of a rule asked of every kind of stretch', () => {
    // 5 minutes at 5 m/s and 400 W, later 5 minutes at 4.5 m/s and 320 W, the rest at 3 m/s and 250 W.
    const run = syntheticRun(1500, (x) => (x >= 300 && x < 600 ? { speed: 5, power: 400 } : x >= 800 && x < 1100 ? { speed: 4.5, power: 320 } : { speed: 3, power: 250 }));
    const fastest = ruleOf({ type: 'fastest', kind: 'time', target: 300 });
    expect(ruleSegments(fastest, run, rowFor(run))[0].from).toBe(300);
    // "Fastest 5 min · Power 310–330 W": the second stretch (the power was not looked at, and the first came back).
    const withPower = { ...fastest, conditions: { ...fastest.conditions, metric: 'power', metricMin: 310, metricMax: 330 } };
    expect(ruleSegments(withPower, run, rowFor(run))[0].from).toBe(800);
    // The main effort of a run without laps starts on the move: asked for a standing start, it is none.
    const main = ruleOf({ type: 'main' });
    expect(ruleSegments(main, run, rowFor(run))).toHaveLength(1);
    expect(ruleSegments({ ...main, conditions: { ...main.conditions, start: 'standing' } }, run, rowFor(run))).toHaveLength(0);
    expect(ruleSegments({ ...main, conditions: { ...main.conditions, start: 'flying' } }, run, rowFor(run))).toHaveLength(1);
  });

  it('A path of 4 km run every time gives route segments', () => {
    // Twenty runs along the same 4 km, no junction on it: left out whole for being over 3 km, now in two parts.
    const path = Array.from({ length: 401 }, (_, i) => at(i * 10, 0, 0));
    const segments = detectRouteSegments(Array.from({ length: 20 }, (_, k) => ({ runId: `r${k}`, pts: track(path) })));
    expect(segments.length).toBeGreaterThanOrEqual(2);
    expect(segments.every((s) => s.length <= 3000 && s.length >= 800)).toBe(true);
  });

  it('Two segments from one start, each with an id of its own', () => {
    // A way out and back from one start, turned just under 3 km by most runs and just under 2 km by a few (each run
    // a metre or two beside the others): the two segments of one start and one heading had one id, and a suggestion
    // kept or dismissed by it was either of them.
    const outAndBack = (m: number, k: number) => {
      const n = m / 10 + 1;
      return track([...Array.from({ length: n }, (_, i) => at(i * 10, (k % 5) - 2, 0)), ...Array.from({ length: n }, (_, i) => at((n - 1 - i) * 10, (k % 5) - 2, 180))]);
    };
    const segments = detectRouteSegments([
      ...Array.from({ length: 30 }, (_, k) => ({ runId: `a${k}`, pts: outAndBack(2980, k) })),
      ...Array.from({ length: 6 }, (_, k) => ({ runId: `b${k}`, pts: outAndBack(1980, k) })),
    ]);
    expect(new Set(segments.map((s) => s.id)).size).toBe(segments.length);
    // The two that would share one carry their length; a segment alone at its start keeps the id it had.
    const suffixed = segments.filter((s) => s.id.endsWith(`-${s.length}`));
    expect(suffixed.map((s) => s.length).sort()).toEqual([1980, 2980]);
    expect(new Set(suffixed.map((s) => s.id.slice(0, -5))).size).toBe(1);
    expect(segments.length).toBeGreaterThan(suffixed.length);
  });

  it('An effort starting on a sample without a distance', () => {
    // A file whose heart rate comes in records of its own: samples without a distance. A minute at 4 m/s from
    // minute 12 is 240 m, not the 3.1 km run up to its end.
    const run = syntheticRun(1500, () => ({ speed: 4, heartRate: 150 }));
    run.samples.distance[720] = null;
    run.samples.distance[779] = null;
    const effort = buildInstance(steadyDef({ paceMin: null, paceMax: null }), run, rowFor(run), 720, 780);
    expect(effort.distance).toBeGreaterThan(232);
    expect(effort.distance).toBeLessThan(244);
    expect(effort.context.before.kmOfRun).toBeCloseTo(2.88, 1);
  });

  it('An auto-lap run with a press of the lap button', () => {
    const laps = (ds: number[]) => ds.map((distance, k) => ({ start: k * 300, end: (k + 1) * 300, duration: 300, distance }));
    // An easy 10 km on 1 km auto-laps, the button pressed once at 650 m: still auto-laps.
    expect(isAutoLapRun(laps([1000, 1000, 650, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 350]))).toBe(true);
    // A warm-up of 2 km before 8 reps of 1 km, and 3 reps after 3 km: workouts, their first lap longer than the reps.
    expect(isAutoLapRun(laps([2000, ...Array(8).fill(1000), 500]))).toBe(false);
    expect(isAutoLapRun(laps([3000, 1000, 1000, 1000, 600]))).toBe(false);
    // Half the laps cut short: no auto-laps.
    expect(isAutoLapRun(laps([1000, 400, 1000, 300, 1000, 200]))).toBe(false);
  });
});
