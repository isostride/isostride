import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CS_RANGE, CURVE_DURATIONS, bestsWithin, curveOfEstimate, curvesOf, estimateCurve, estimatedValue, fittedValue, mergeBests, strongestFragment, type CurvePoint } from '@/lib/curve';
import { PATHS, writeJson } from '@/lib/fs';
import type { RunFile } from '@/lib/kernel';
import { NodeFolder } from '../support/nodeFolder';
import { rowFor, syntheticRun } from '../support/synthetic';

const PACE = (s: number) => 1000 / s;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'curve-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

/** 30 minutes at 6:00/km with 10 minutes at 4:00/km in the middle. */
const withEffort = (id: string, start: string): RunFile => ({ ...syntheticRun(1800, (t) => ({ speed: t >= 600 && t < 1200 ? PACE(240) : PACE(360), heartRate: 150 })), id, startTime: start });

describe('Pace curve', () => {
  it('Pace curve inside the segments', () => {
    const run = withEffort('a', '2026-10-01T07:00:00.000Z');
    // Over the whole run: every length up to 10 minutes lies in the effort; longer ones mix in easy running; none beyond the run.
    const whole = bestsWithin(run, [[0, 1e9]]);
    expect(whole.map((b) => b.duration)).toEqual(CURVE_DURATIONS.filter((d) => d <= 1800));
    const pace = (list: typeof whole, d: number) => list.find((b) => b.duration === d)!.value;
    for (const d of [30, 300, 600]) expect(pace(whole, d)).toBeCloseTo(240, 0);
    expect(pace(whole, 900)).toBeCloseTo(270, 0);
    expect(pace(whole, 1800)).toBeCloseTo(309, 0);
    expect(Math.abs(whole.find((b) => b.duration === 600)!.from - 600)).toBeLessThanOrEqual(2);
    // Inside the first 10 minutes only: easy pace, and nothing longer than the stretch.
    const first = bestsWithin(run, [[0, 600]]);
    expect(first.map((b) => b.duration)).toEqual([30, 60, 120, 180, 300, 600]);
    expect(pace(first, 300)).toBeCloseTo(360, 0);
    // A segment of 598 s, from one sample to another (the fastest 10 minutes may fall 2 s short): its last sample counts, so it holds a 10-minute best.
    expect(bestsWithin(run, [[601, 1199]]).map((b) => b.duration)).toContain(600);
    expect(pace(bestsWithin(run, [[601, 1199]]), 600)).toBeCloseTo(240, 0);
    // Two segments of one run: for each length the faster of them.
    expect(pace(bestsWithin(run, [[0, 600], [600, 1200]]), 300)).toBeCloseTo(240, 0);
    // Across runs: for each length the faster point, whichever run it comes from.
    const pt = (runId: string, duration: number, p: number): CurvePoint => ({ runId, duration, value: p, date: '', title: null, from: 0, to: duration });
    expect(mergeBests([pt('a', 60, 220), pt('a', 600, 250)], [pt('b', 60, 210), pt('b', 600, 260), pt('b', 1800, 300)]).map((p) => [p.duration, p.runId])).toEqual([[60, 'b'], [600, 'a'], [1800, 'b']]);
    expect(mergeBests([], [])).toEqual([]);
  });

  it('Estimate fitted to the bests', () => {
    // Bests that follow Riegel's law with exponent 1.07 (speed ∝ t^−0.07), 4:00/km at 10 min: the law is recovered.
    const v10 = 1000 / 240;
    const law = [180, 300, 600, 1200, 1800, 3600].map((d) => ({ duration: d, value: 1000 / (v10 * Math.pow(d / 600, -0.07)) }));
    const e = estimateCurve([{ duration: 60, value: 190 }, ...law])!;
    expect(e.n).toBe(6);
    expect(e.k).toBeCloseTo(0.07, 3);
    expect(estimatedValue(e, 600)).toBeCloseTo(240, 0);
    // Predicted times along the law: 10 km in about 44.4 min, the marathon about 3 h 29 min; the sprint of 60 s is left out of the fit.
    const by = Object.fromEntries(e.predictions.map((p) => [p.distance, p.seconds]));
    expect(by[10000] / 60).toBeCloseTo(44.4, 0);
    expect(by[42195] / 3600).toBeCloseTo(3.5, 1);
    // Critical speed from the 2–20 min bests: d = CS·t + D′.
    expect(e.critical).not.toBeNull();
    expect(e.critical!.n).toBe(4);
    expect(1000 / e.critical!.rate).toBeGreaterThan(240);
    expect(e.critical!.reserve).toBeGreaterThan(0);
    // An envelope ("idz ta metoda"): an easy long run far below the law does not pull it down; the line stays on the
    // strongest bests (its exponent as without the easy run), and no best lies above it by more than 0.1 %.
    const withEasy = [...law, { duration: 7200, value: 400 }];
    const env = estimateCurve(withEasy)!;
    expect(env.k).toBeCloseTo(0.07, 3);
    for (const p of withEasy) expect(estimatedValue(env, p.duration)).toBeLessThanOrEqual(p.value * 1.001);
    expect(withEasy.some((p) => Math.abs(estimatedValue(env, p.duration) / p.value - 1) < 1e-3)).toBe(true);
    // Fewer than 3 bests of 3 minutes and more: no estimate; with none of 2–20 min, no critical speed.
    expect(estimateCurve(law.slice(0, 2))).toBeNull();
    expect(estimateCurve([{ duration: 1800, value: 250 }, { duration: 3600, value: 260 }, { duration: 7200, value: 275 }])!.critical).toBeNull();
  });

  it('Curve bent as the critical model, the power law past it', () => {
    // Bests on the critical speed model, CS 4 m/s and D′ 200 m: v = 4 + 200/t, a hyperbola, not a line on the log axis.
    const pts = [120, 180, 300, 600, 900, 1200].map((d) => ({ duration: d, value: 1000 / (4 + 200 / d) }));
    const e = estimateCurve(pts)!;
    expect(e.critical!.rate).toBeCloseTo(4, 6);
    expect(e.critical!.reserve).toBeCloseTo(200, 4);
    // Within 2–20 minutes the fitted curve is the hyperbola: through every best, and at any length between them.
    for (const p of pts) expect(fittedValue(e, p.duration)).toBeCloseTo(p.value, 6);
    expect(fittedValue(e, 450)).toBeCloseTo(1000 / (4 + 200 / 450), 6);
    // It bends: on the log axis the pace changes more from 2 to 6 minutes than from 6.7 to 20 (each a factor of 3).
    const step = (a: number, b: number) => fittedValue(e, b) - fittedValue(e, a);
    expect(step(120, 360)).toBeGreaterThan(1.5 * step(400, 1200));
    // Past 20 minutes the power law, drawn apart as an extrapolation up to an hour.
    expect(fittedValue(e, 1800)).toBe(estimatedValue(e, 1800));
    const c = curveOfEstimate(e);
    expect(c.estimate[0].duration).toBeCloseTo(CS_RANGE[0], 6);
    expect(c.estimate[c.estimate.length - 1].duration).toBeCloseTo(CS_RANGE[1], 6);
    expect(c.extrapolate[0].duration).toBeCloseTo(CS_RANGE[1], 6);
    expect(c.extrapolate[c.extrapolate.length - 1].duration).toBeCloseTo(3600, 6);
    expect(c.at(600)).toBe(fittedValue(e, 600));
    // A critical model with no reserve above it (D′ ≤ 0) cannot bend the curve: the power law instead.
    const flat = estimateCurve([120, 180, 300, 600, 900, 1200].map((d) => ({ duration: d, value: 1000 / (4 - 20 / d) })))!;
    expect(flat.critical!.reserve).toBeLessThan(0);
    expect(fittedValue(flat, 600)).toBe(estimatedValue(flat, 600));
  });

  it('Critical model as an envelope', () => {
    // Bests around v = 4 + 200/t with noise; the 3-minute one well above the rest ("powaznie?" to a 3:17 under a curve of 3:26).
    const noise = [1, 1.04, 0.99, 1.01, 0.995, 1];
    const pts = [120, 180, 300, 600, 900, 1200].map((d, i) => ({ duration: d, value: 1000 / ((4 + 200 / d) * noise[i]) }));
    const e = estimateCurve(pts)!;
    // No best of 2–20 minutes is faster than the curve by more than 0.1 %, and it passes through the strongest.
    for (const p of pts) expect(fittedValue(e, p.duration)).toBeLessThanOrEqual(p.value * 1.001);
    expect(Math.abs(fittedValue(e, 180) / pts[1].value - 1)).toBeLessThan(1e-3);
    // Both parameters from the envelope's fit: the critical speed is no longer the ordinary regression's.
    const v = pts.map((p) => 1000 / p.value);
    const t = pts.map((p) => p.duration);
    const tm = t.reduce((x, y) => x + y) / t.length;
    const dm = t.reduce((x, y, i) => x + y * v[i], 0) / t.length;
    const slope = t.reduce((x, y, i) => x + (y - tm) * (y * v[i] - dm), 0) / t.reduce((x, y) => x + (y - tm) ** 2, 0);
    expect(Math.abs(e.critical!.rate - slope)).toBeGreaterThan(1e-4);
  });

  it('Curves from the data folder', async () => {
    // Three runs; one item holds the efforts of the first two, another the easy start of the third.
    const folder = new NodeFolder(dir);
    const runs = [withEffort('r0', '2026-10-01T07:00:00.000Z'), withEffort('r1', '2026-10-08T07:00:00.000Z'), withEffort('r2', '2026-10-15T07:00:00.000Z')];
    await writeJson(folder, PATHS.runsIndex, { schemaVersion: 1, algorithmVersion: 1, runs: runs.map((r, k) => rowFor(r, { title: k === 1 ? 'tempo day' : undefined })) });
    for (const r of runs) await writeJson(folder, PATHS.runFile(r.id), r);
    const seen: number[] = [];
    const curves = await curvesOf(folder, [
      { key: 'efforts', ranges: { r0: [[600, 1200]], r1: [[600, 1200]], gone: [[0, 100]] } },
      { key: 'easy', ranges: { r2: [[0, 600]] } },
    ], (p) => seen.push(p.done));
    // Each run named is read once; a run that is no longer there is passed over.
    expect(seen).toEqual([1, 2, 3]);
    expect(curves.efforts.map((p) => p.duration)).toEqual([30, 60, 120, 180, 300, 600]);
    expect(curves.efforts[5].duration).toBe(600);
    expect(Math.abs(curves.efforts[5].from - 600)).toBeLessThanOrEqual(2);
    expect(curves.efforts[5].value).toBeCloseTo(240, 0);
    expect(['r0', 'r1']).toContain(curves.efforts[5].runId);
    expect(curves.easy.every((p) => p.runId === 'r2' && Math.abs(p.value - 360) < 1)).toBe(true);
    expect((await curvesOf(folder, [{ key: 'none', ranges: {} }])).none).toEqual([]);
  });
  it('Power curve inside the segments', async () => {
    // 30 minutes at 200 W with 10 minutes at 300 W in the middle.
    const run = syntheticRun(1800, (t) => ({ speed: PACE(300), power: t >= 600 && t < 1200 ? 300 : 200 }));
    const whole = bestsWithin(run, [[0, 1e9]], 'power');
    expect(whole.map((b) => b.duration)).toEqual(CURVE_DURATIONS.filter((d) => d <= 1800));
    const watts = (list: typeof whole, d: number) => list.find((b) => b.duration === d)!.value;
    for (const d of [30, 300, 600]) expect(watts(whole, d)).toBeCloseTo(300, 0);
    expect(watts(whole, 900)).toBeCloseTo(266.7, 0);
    expect(watts(whole, 1800)).toBeCloseTo(233.3, 0);
    expect(Math.abs(whole.find((b) => b.duration === 600)!.from - 600)).toBeLessThanOrEqual(2);
    // The first 10 minutes only: the easier power.
    expect(watts(bestsWithin(run, [[0, 600]], 'power'), 300)).toBeCloseTo(200, 0);
    // A pause of a minute counts as no power, however long the last sample before it.
    // (the pause after the effort: 25 minutes cannot avoid it, 10 minutes can).
    const paused = { ...run, samples: { ...run.samples, t: run.samples.t.map((t) => (t >= 1300 ? t + 60 : t)) } };
    expect(strongestFragment(paused, 600, [0, 1e9])!.power).toBeCloseTo(300, 0);
    expect(strongestFragment(run, 1500, [0, 1e9])!.power).toBeCloseTo(240, 0);
    expect(strongestFragment(paused, 1500, [0, 1e9])!.power).toBeLessThan(235);
    // A run without power: no point.
    expect(bestsWithin(syntheticRun(1800, () => ({ speed: PACE(300) })), [[0, 1e9]], 'power')).toEqual([]);
    // Across runs: the higher power.
    const pt = (runId: string, duration: number, w: number): CurvePoint => ({ runId, duration, value: w, date: '', title: null, from: 0, to: duration });
    expect(mergeBests([pt('a', 60, 320)], [pt('b', 60, 340)], 'power')[0].runId).toBe('b');
    expect(mergeBests([pt('a', 60, 320)], [pt('b', 60, 300)], 'power')[0].runId).toBe('a');
    // The estimate: bests that follow critical power (CP 250 W, W′ 15 kJ) give the model back, no best above the law, no race times.
    const cp = [120, 180, 300, 600, 900, 1200].map((d) => ({ duration: d, value: 250 + 15000 / d }));
    const e = estimateCurve(cp, 'power')!;
    expect(e.metric).toBe('power');
    expect(e.critical!.rate).toBeCloseTo(250, 6);
    expect(e.critical!.reserve).toBeCloseTo(15000, 3);
    expect(e.predictions).toEqual([]);
    for (const p of cp.filter((x) => x.duration >= 180)) expect(estimatedValue(e, p.duration)).toBeGreaterThanOrEqual(p.value * 0.999);
    // Power falls with time: higher at 3 minutes than at an hour.
    expect(estimatedValue(e, 180)).toBeGreaterThan(estimatedValue(e, 3600));
    // From the data folder: the source's metric chooses the curve.
    const folder = new NodeFolder(dir);
    const r = { ...run, id: 'p0', startTime: '2026-10-20T07:00:00.000Z' };
    await writeJson(folder, PATHS.runsIndex, { schemaVersion: 1, algorithmVersion: 1, runs: [rowFor(r)] });
    await writeJson(folder, PATHS.runFile(r.id), r);
    const got = await curvesOf(folder, [{ key: 'w', metric: 'power', ranges: { p0: [[0, 1e9]] } }]);
    expect(got.w.find((p) => p.duration === 300)!.value).toBeCloseTo(300, 0);
  });
});
