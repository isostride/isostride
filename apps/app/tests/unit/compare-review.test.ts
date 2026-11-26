import { describe, expect, it } from 'vitest';
import { definitionFromRule, lapKey, ruleOf } from '@/lib/blocks';
import { MIN_AB_INSTANCES, MIN_TREND_INSTANCES, byField, cell, computeAb, computeTrend, interleaved } from '@/lib/compare';
import { detectInstances } from '@/lib/detection';
import { pauseGap, type RunFile } from '@/lib/kernel';
import { t975, welch } from '@/lib/stats';
import { days, inst } from '../support/instances';
import { rowFor, syntheticRun } from '../support/synthetic';

const split = byField('shoes', 'Shoes A', 'Shoes B');
const shoe = (which: 'A' | 'B') => ({ shoes: `Shoes ${which}` });

/**
 * The review of the comparisons (26 Nov 2026, the runner's "przegladnij aplikacje raz jeszcze ... pod katem
 * modeli ale nie tylko", then "tak zacznij od poczzatku ... i przejdz przez wszystkie"): each fault with the
 * behaviour that replaces it.
 */
describe('Comparisons reviewed', () => {
  it('Pace corrected by the slope inside the groups', () => {
    // A at 5:00/km and 150 bpm, B at 5:10/km and 155 bpm, each ±2 s/km with no effect of pace inside a group:
    // over both groups the slope on pace was the difference itself, and +5 bpm read +0.4.
    const d = days('2026-08-03', 16);
    const wobble = [-2, 2, -1, 1, -2, 2, -1, 1];
    const flat = [
      ...wobble.map((w, k) => inst(d[2 * k], { pace: 300 + w, metrics: { heartRate: 150 + (k % 2 ? 0.2 : -0.2) }, run: shoe('A') })),
      ...wobble.map((w, k) => inst(d[2 * k + 1], { pace: 310 + w, metrics: { heartRate: 155 + (k % 2 ? -0.2 : 0.2) }, run: shoe('B') })),
    ];
    const kept = computeAb(flat, 'def', 'heartRate', split);
    expect(kept.corrected).toBe(true);
    expect(kept.difference!).toBeCloseTo(5, 0);
    expect(kept.verdict).toBe('change');
    // Inside each group the heart rate falls 0.5 bpm for each s/km slower; B runs 10 s/km faster at the same
    // heart rate: at an equal pace B would be 5 bpm lower (it read −0.4).
    const sloped = [
      ...wobble.map((w, k) => inst(d[2 * k], { pace: 310 + 3 * w, metrics: { heartRate: 150 - 0.5 * 3 * w }, run: shoe('A') })),
      ...wobble.map((w, k) => inst(d[2 * k + 1], { pace: 300 + 3 * w, metrics: { heartRate: 150 - 0.5 * 3 * w }, run: shoe('B') })),
    ];
    const equalPace = computeAb(sloped, 'def', 'heartRate', split);
    expect(equalPace.rawDifference!).toBeCloseTo(0, 6);
    expect(equalPace.difference!).toBeCloseTo(-5, 6);
  });

  it('The run is the unit of a comparison', () => {
    // Two runs of four reps with each shoe: eight efforts a side, but two runs, so no verdict yet.
    const d = days('2026-08-03', 4);
    const reps = (day: string, which: 'A' | 'B', hr: number[]) => hr.map((v, k) => inst(day, { runId: `run-${day}`, start: 600 + 400 * k, end: 900 + 400 * k, metrics: { heartRate: v }, run: shoe(which) }));
    const all = [...reps(d[0], 'A', [160, 161, 162, 161]), ...reps(d[1], 'B', [165, 166, 167, 166]), ...reps(d[2], 'A', [160, 162]), ...reps(d[3], 'B', [166, 167, 168, 167])];
    const r = computeAb(all, 'def', 'heartRate', split, ['Shoes A', 'Shoes B'], {}, false);
    expect([r.a.points.length, r.a.runs, r.b.points.length, r.b.runs]).toEqual([6, 2, 8, 2]);
    expect(r.verdict).toBeNull();
    // Each run once, by the mean of its efforts: A (161 + 161) / 2, B (166 + 167) / 2.
    expect(r.a.mean).toBeCloseTo(161, 9);
    expect(r.difference).toBeCloseTo(5.5, 9);
    // Welch's interval on the runs' means: 1, 2, 3, 4 against 2, 4, 6, 8 give 2.5 ± t(4) · sqrt(25/12).
    const w = welch([1, 2, 3, 4], [2, 4, 6, 8])!;
    expect(w.difference).toBe(2.5);
    expect(w.df).toBeCloseTo(4.412, 3);
    expect(w.ci[1] - w.difference).toBeCloseTo(2.776 * Math.sqrt(25 / 12), 3);
    expect(welch([1], [2, 3])).toBeNull();
    // Student's t past the table: 2.04 at 31 degrees, not the normal's 1.96.
    expect(t975(31)).toBeCloseTo(2.04, 2);
    expect(t975(120)).toBeCloseTo(1.98, 2);
    // A trend counts runs too: five efforts of two runs have no line.
    const two = [...reps(d[0], 'A', [150, 151, 152]), ...reps(d[2], 'A', [149, 148])];
    const series = computeTrend(two, 'def', 'heartRate', {}, false).series[0];
    expect([series.points.length, series.runs, series.fit]).toEqual([5, 2, null]);
    expect([MIN_AB_INSTANCES, MIN_TREND_INSTANCES]).toEqual([4, 5]);
  });

  it('A trend kept by the pace correction', () => {
    // Eight weekly efforts, the pace going from 5:20 to 4:52 /km at a flat 150 bpm: the efficiency rises.
    // Pace and time cannot be told apart, so nothing is corrected (the slope on pace alone took the trend away).
    const d = days('2026-08-03', 8);
    const faster = d.map((day, k) => inst(day, { pace: 320 - 4 * k, metrics: { heartRate: 150, efficiency: (1000 / (320 - 4 * k)) * 60 / 150 } }));
    const efficiency = computeTrend(faster, 'def', 'efficiency').series[0];
    expect(efficiency.points.every((p) => p.corrected === p.raw)).toBe(true);
    expect(efficiency.fit!.change).toBeGreaterThan(0.1);
    // Effort pace is a pace: never corrected for pace.
    const effort = computeTrend(faster.map((i, k) => ({ ...i, metrics: { ...i.metrics, effortPace: 1000 / (320 - 4 * k) } })), 'def', 'effortPace').series[0];
    expect(effort.points.every((p) => p.corrected === p.raw)).toBe(true);
    // The pace wobbling week to week while the heart rate falls by 1 bpm a week and rises 0.2 bpm for each
    // s/km faster: the correction takes the wobble out and leaves the fall.
    const wobble = [3, -2, 4, -3, 2, -4, 3, -2];
    const falling = d.map((day, k) => inst(day, { pace: 300 + wobble[k], metrics: { heartRate: 160 - k - 0.2 * wobble[k] } }));
    const hr = computeTrend(falling, 'def', 'heartRate').series[0];
    expect(hr.fit!.change).toBeCloseTo(-7, 6);
    expect(hr.noise).toBeCloseTo(0, 6);
  });

  it('Groups that take turns in time', () => {
    const d = days('2026-08-03', 20);
    // Rotated week by week: they take turns.
    expect(interleaved(d.filter((_, k) => k % 2 === 0), d.filter((_, k) => k % 2 === 1))).toBe(true);
    // One wholly before the other: they do not.
    expect(interleaved(d.slice(0, 10), d.slice(10))).toBe(false);
    // Ten runs of A, then nine of B with one of A among them: more than one switch, but no turns taken.
    expect(interleaved([...d.slice(0, 10), d[15]], d.slice(10).filter((_, k) => k !== 5))).toBe(false);
    // A between two runs of B does take turns.
    expect(interleaved([d[0], d[2]], [d[1]])).toBe(true);
  });

  it('Segments of their whole length and distance', () => {
    // Laps of 1 km at 4:05/km and of 60 s at 4:00/km, jogs between.
    const laps = [[245, 245], [120, 360], [60, 240], [120, 360], [245, 245], [300, 360]] as [number, number][];
    let at = 0;
    const ends = laps.map(([s]) => (at += s));
    const run: RunFile = { ...syntheticRun(at, (x) => ({ speed: 1000 / (laps[ends.findIndex((e) => x < e)] ?? laps[laps.length - 1])[1], heartRate: 150 })), id: 'a' };
    let from = 0;
    run.laps = laps.map(([s, p]) => { const lap = { start: from, end: from + s, duration: s, distance: (s * 1000) / p }; from += s; return lap; });
    const found = (rule: Parameters<typeof definitionFromRule>[1]) => detectInstances(definitionFromRule('', rule), run, rowFor(run), []);
    // The fastest 2 minutes: 120 s, not 118.
    const [fastest] = found(ruleOf({ type: 'fastest', kind: 'time', target: 120 }));
    expect(fastest.duration).toBe(120);
    // A lap of 1 km in 245 s: 1000 m (it read 996 m, a sample short of its time).
    const km = found(ruleOf({ type: 'lap', planned: { kind: 'distance', target: 1000, tolerance: 0.1 } }));
    expect(km.map((i) => [i.duration, i.distance])).toEqual([[245, 1000], [245, 1000]]);
  });

  it('A lap read as the reps of its set', () => {
    const lap = (duration: number, distance: number, start = 0) => ({ start, end: start + duration, duration, distance });
    // 6 × 1 km around 4:00: the rep run in 241 s fits 4 minutes too, but its set is of kilometres.
    const kms = [lap(600, 1700), lap(241, 1000), lap(249, 1001), lap(236, 999), lap(252, 1000), lap(300, 800)];
    expect(kms.slice(1, 5).map((l, k) => lapKey(l, k + 1, kms))).toEqual(Array(4).fill({ kind: 'distance', target: 1000 }));
    // 4 × 4 min around 4:00/km: the rep that covered 1003 m fits a kilometre too, but its set is of minutes.
    const mins = [lap(600, 1700), lap(240, 1003), lap(240, 975), lap(241, 1040), lap(239, 960), lap(300, 800)];
    expect(mins.slice(1, 5).map((l, k) => lapKey(l, k + 1, mins))).toEqual(Array(4).fill({ kind: 'time', target: 240 }));
    // Alone, or with reps that all read both ways, by the closer of the two: 240 s exactly, 1003 m.
    expect(lapKey(lap(240, 1003), 0, [lap(240, 1003), lap(300, 800)])).toEqual({ kind: 'time', target: 240 });
    expect(lapKey(lap(242, 1000), 0, [lap(242, 1000), lap(300, 800)])).toEqual({ kind: 'distance', target: 1000 });
  });

  it('A run recorded smart keeps its segments', () => {
    // A sample every 3 or 4 s, as a watch saving its battery records: no gap is a pause.
    const whole = syntheticRun(1200, (x) => ({ speed: x >= 300 && x < 900 ? 4 : 3, heartRate: x >= 300 && x < 900 ? 160 : 140 }));
    const keep = whole.samples.t.map((_, i) => i).filter((i) => i % 7 === 0 || i % 7 === 3);
    const pick = <T,>(xs: T[]) => keep.map((i) => xs[i]);
    const s = whole.samples;
    const smart: RunFile = { ...whole, id: 'smart', samples: { t: pick(s.t), distance: pick(s.distance), lat: pick(s.lat), lon: pick(s.lon), values: Object.fromEntries(Object.entries(s.values).map(([k, v]) => [k, pick(v ?? [])])) } };
    expect(pauseGap(smart.samples.t)).toBe(10);
    expect(pauseGap(whole.samples.t)).toBe(2);
    const [fastest] = detectInstances(definitionFromRule('', ruleOf({ type: 'fastest', kind: 'time', target: 300 })), smart, rowFor(smart), []);
    expect(fastest.context.block.stopped).toBe(0);
    expect(fastest.metrics.heartRate).toBeCloseTo(160, 0);
    expect(fastest.context.block.pace).toBe(250);
    // A real pause of 30 s in it is still a stop.
    const paused: RunFile = { ...smart, id: 'paused', samples: { ...smart.samples, t: smart.samples.t.map((x) => (x >= 600 ? x + 30 : x)) } };
    const [withStop] = detectInstances(definitionFromRule('', ruleOf({ type: 'run' })), paused, rowFor(paused), []);
    expect(withStop.context.block.stopped).toBeGreaterThanOrEqual(26);
  });

  it('CSV cells no spreadsheet runs', () => {
    // A name from someone else's file that a spreadsheet would run as a formula gets an apostrophe.
    expect(cell('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"');
    expect(cell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(cell('+1 shoe')).toBe("'+1 shoe");
    // Numbers stay numbers, negative ones too; a text with a comma or a line end is quoted.
    expect([cell(-5.25), cell('-5.250'), cell('+3'), cell('Promenade, NE'), cell('two\rlines')]).toEqual(['-5.25', '-5.250', '+3', '"Promenade, NE"', '"two\rlines"']);
  });
});
