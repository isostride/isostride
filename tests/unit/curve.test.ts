import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CURVE_DURATIONS, bestsWithin, curvesOf, estimateCurve, estimatedPace, mergeBests, type CurvePoint } from '@/lib/curve';
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
    const pace = (list: typeof whole, d: number) => list.find((b) => b.duration === d)!.pace;
    for (const d of [30, 300, 600]) expect(pace(whole, d)).toBeCloseTo(240, 0);
    expect(pace(whole, 900)).toBeCloseTo(270, 0);
    expect(pace(whole, 1800)).toBeCloseTo(309, 0);
    expect(Math.abs(whole.find((b) => b.duration === 600)!.from - 600)).toBeLessThanOrEqual(2);
    // Inside the first 10 minutes only: easy pace, and nothing longer than the stretch.
    const first = bestsWithin(run, [[0, 600]]);
    expect(first.map((b) => b.duration)).toEqual([30, 60, 120, 180, 300, 600]);
    expect(pace(first, 300)).toBeCloseTo(360, 0);
    // Two segments of one run: for each length the faster of them.
    expect(pace(bestsWithin(run, [[0, 600], [600, 1200]]), 300)).toBeCloseTo(240, 0);
    // Across runs: for each length the faster point, whichever run it comes from.
    const pt = (runId: string, duration: number, p: number): CurvePoint => ({ runId, duration, pace: p, date: '', title: null, from: 0, to: duration });
    expect(mergeBests([pt('a', 60, 220), pt('a', 600, 250)], [pt('b', 60, 210), pt('b', 600, 260), pt('b', 1800, 300)]).map((p) => [p.duration, p.runId])).toEqual([[60, 'b'], [600, 'a'], [1800, 'b']]);
    expect(mergeBests([], [])).toEqual([]);
  });

  it('Estimate fitted to the bests', () => {
    // Bests that follow Riegel's law with exponent 1.07 (speed ∝ t^−0.07), 4:00/km at 10 min: the law is recovered.
    const v10 = 1000 / 240;
    const law = [180, 300, 600, 1200, 1800, 3600].map((d) => ({ duration: d, pace: 1000 / (v10 * Math.pow(d / 600, -0.07)) }));
    const e = estimateCurve([{ duration: 60, pace: 190 }, ...law])!;
    expect(e.n).toBe(6);
    expect(e.k).toBeCloseTo(0.07, 3);
    expect(estimatedPace(e, 600)).toBeCloseTo(240, 0);
    // Predicted times along the law: 10 km in about 44.4 min, the marathon about 3 h 29 min; the sprint of 60 s is left out of the fit.
    const by = Object.fromEntries(e.predictions.map((p) => [p.distance, p.seconds]));
    expect(by[10000] / 60).toBeCloseTo(44.4, 0);
    expect(by[42195] / 3600).toBeCloseTo(3.5, 1);
    // Critical speed from the 2–20 min bests: d = CS·t + D′.
    expect(e.cs).not.toBeNull();
    expect(e.cs!.n).toBe(4);
    expect(1000 / e.cs!.cs).toBeGreaterThan(240);
    expect(e.cs!.dPrime).toBeGreaterThan(0);
    // An envelope: an easy long run below the law leaves the line on the strongest bests, and no best lies above it.
    const withEasy = [...law, { duration: 7200, pace: 400 }];
    const env = estimateCurve(withEasy)!;
    expect(env.k).toBeGreaterThan(0.07);
    for (const p of withEasy) expect(estimatedPace(env, p.duration)).toBeLessThanOrEqual(p.pace + 1e-9);
    expect(withEasy.some((p) => Math.abs(estimatedPace(env, p.duration) - p.pace) < 1e-6)).toBe(true);
    // Fewer than 3 bests of 3 minutes and more: no estimate; with none of 2–20 min, no critical speed.
    expect(estimateCurve(law.slice(0, 2))).toBeNull();
    expect(estimateCurve([{ duration: 1800, pace: 250 }, { duration: 3600, pace: 260 }, { duration: 7200, pace: 275 }])!.cs).toBeNull();
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
    expect(curves.efforts[5].pace).toBeCloseTo(240, 0);
    expect(['r0', 'r1']).toContain(curves.efforts[5].runId);
    expect(curves.easy.every((p) => p.runId === 'r2' && Math.abs(p.pace - 360) < 1)).toBe(true);
    expect((await curvesOf(folder, [{ key: 'none', ranges: {} }])).none).toEqual([]);
  });
});
