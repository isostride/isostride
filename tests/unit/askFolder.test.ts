import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { datesPeriod, seriesOfRuns, type RunSet } from '@/lib/ask';
import { CRITERIA_TOLERANCES, defaultTolerances } from '@/lib/blocks';
import { PATHS, writeJson } from '@/lib/fs';
import type { RunFile } from '@/lib/kernel';
import { NodeFolder } from '../support/nodeFolder';
import { rowFor, syntheticRun } from '../support/synthetic';

const PACE = (s: number) => 1000 / s;
const NO_FILTERS = { workoutType: null, shoes: null, title: null };
const SEPT = datesPeriod('2026-09-01', null);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ask-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('Run sets in Analysis', () => {
  it('Series of a run set from the data folder', async () => {
    // Eight short runs a week apart since September: pace quickening 5 s/km a week, one titled, five tagged easy.
    const folder = new NodeFolder(dir);
    const day = (k: number) => new Date(Date.UTC(2026, 8, 2 + 7 * k, 7)).toISOString();
    const runs: RunFile[] = Array.from({ length: 8 }, (_, k) => ({
      ...syntheticRun(200, (t) => ({ speed: t >= 60 && t < 180 ? PACE(240 - 5 * k) : PACE(330 - 5 * k), heartRate: 150 - k })),
      id: `r${k}`, startTime: day(k),
    }));
    const rows = runs.map((r, k) => rowFor(r, { title: k === 2 ? 'COROS test' : undefined, workoutType: k % 3 ? 'easy' : 'tempo', avgHeartRate: 150 - k }));
    await writeJson(folder, PATHS.runsIndex, { schemaVersion: 1, algorithmVersion: 1, runs: rows });
    for (const r of runs) await writeJson(folder, PATHS.runFile(r.id), r);

    // Three metrics in one pass over the eight runs, read with progress: pace with a verdict, the fastest 2 min, and the maximum heart rate.
    const seen: number[] = [];
    const set: RunSet = { period: SEPT, filters: NO_FILTERS, stat: 'max' };
    const series = await seriesOfRuns(folder, set, ['speed', 'best:120s', 'heartRate'], (p) => seen.push(p.done));
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(series.speed.points.map((p) => p.runId)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7']);
    expect(series.speed.fit?.verdict).toBe('change');
    expect(series['best:120s'].points[7]).toMatchObject({ runId: 'r7', from: 60 });
    expect(series['best:120s'].points[7].value).toBeCloseTo(205, 0);
    expect(series.heartRate.points.map((p) => p.value)).toEqual([150, 149, 148, 147, 146, 145, 144, 143]);
    // The filters narrow the set: the titled run alone, or the five tagged easy.
    const titled = await seriesOfRuns(folder, { ...set, filters: { ...NO_FILTERS, title: 'coros' } }, ['speed']);
    expect(titled.speed.points.map((p) => p.title)).toEqual(['COROS test']);
    expect(titled.speed.fit).toBeNull();
    const easy = await seriesOfRuns(folder, { ...set, filters: { ...NO_FILTERS, workoutType: 'easy' } }, ['heartRate']);
    expect(easy.heartRate.points).toHaveLength(5);
    // A period with no runs: an empty series.
    const none = await seriesOfRuns(folder, { ...set, period: datesPeriod('2025-01-01', '2025-12-31') }, ['speed']);
    expect(none.speed).toEqual({ points: [], fit: null });
    // A criteria block's tolerances are the relaxed ones.
    expect(defaultTolerances('criteria')).toEqual(CRITERIA_TOLERANCES);
  });
});
