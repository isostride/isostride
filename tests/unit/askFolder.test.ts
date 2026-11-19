import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { answerQuestion, datesPeriod, sentenceOf, type Query } from '@/lib/ask';
import { CRITERIA_TOLERANCES, defaultTolerances } from '@/lib/blocks';
import { PATHS, writeJson } from '@/lib/fs';
import type { RunFile } from '@/lib/kernel';
import { NodeFolder } from '../support/nodeFolder';
import { rowFor, syntheticRun } from '../support/synthetic';

const NO_FILTERS = { workoutType: null, shoes: null, title: null };
const ALL = datesPeriod(null, null);
const SEPT = datesPeriod('2026-09-01', null);
const PACE = (s: number) => 1000 / s;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ask-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('Questions about the data', () => {
  it('Question answered from the data folder', async () => {
    // Eight short runs a week apart since September: pace quickening 5 s/km a week, one titled, five tagged easy.
    const folder = new NodeFolder(dir);
    const day = (k: number) => { const d = new Date(Date.UTC(2026, 8, 2 + 7 * k, 7)); return d.toISOString(); };
    const runs: RunFile[] = Array.from({ length: 8 }, (_, k) => ({
      ...syntheticRun(200, (t) => ({ speed: t >= 60 && t < 180 ? PACE(240 - 5 * k) : PACE(330 - 5 * k), heartRate: 150 - k })),
      id: `r${k}`, startTime: day(k),
    }));
    const rows = runs.map((r, k) => rowFor(r, { title: k === 2 ? 'COROS test' : undefined, workoutType: k % 3 ? 'easy' : 'tempo', avgHeartRate: 150 - k }));
    await writeJson(folder, PATHS.runsIndex, { schemaVersion: 1, algorithmVersion: 1, runs: rows });
    for (const r of runs) await writeJson(folder, PATHS.runFile(r.id), r);

    // A change: eight runs, every one read with progress, a fitted line and the verdict in the sentence.
    const seen: number[] = [];
    const trend = await answerQuestion(folder, { kind: 'trend', metric: 'speed', stat: 'avg', period: SEPT, filters: NO_FILTERS } satisfies Query, (p) => seen.push(p.done));
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(trend.points.map((p) => p.runId)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7']);
    expect(trend.fit?.verdict).toBe('change');
    expect(trend.sentence).toMatch(/^Pace since 2026-09-01: \d:\d\d \/km → \d:\d\d \/km over 8 runs, \d+ s\/km faster \(−\d+\.\d%\), beyond the noise between runs/);
    // The fastest 2 min in the tagged runs: the stretch at minute 1–3 of the latest easy run; the title shows.
    const best = await answerQuestion(folder, { kind: 'best', window: { kind: 'time', target: 120 }, period: ALL, filters: { ...NO_FILTERS, workoutType: 'easy' }, limit: 10 } satisfies Query);
    expect(best.runs).toBe(5);
    expect(best.ranking[0]).toMatchObject({ runId: 'r7', from: 60 });
    expect(best.sentence).toMatch(/^Fastest 2 min over all runs: 3:2\d \/km on 21 Oct 2026, minute 1–3 of the run; 5 runs ranked\.$/);
    const titled = await answerQuestion(folder, { kind: 'best', window: { kind: 'time', target: 120 }, period: ALL, filters: { ...NO_FILTERS, title: 'coros' }, limit: 10 } satisfies Query);
    expect(titled.sentence).toBe('Fastest 2 min over all runs: 3:50 /km on 16 Sep 2026 (COROS test), minute 1–3 of the run; 1 run ranked.');
    // The lowest heart rate, two of them; nothing in a period with no runs.
    const low = await answerQuestion(folder, { kind: 'top', metric: 'heartRate', stat: 'max', direction: 'low', period: SEPT, filters: NO_FILTERS, limit: 2 } satisfies Query);
    expect(low.ranking.map((p) => p.runId)).toEqual(['r7', 'r6']);
    expect(low.sentence).toMatch(/^Lowest maximum heart rate since 2026-09-01: 143 bpm on 21 Oct 2026; 2 runs ranked\.$/);
    const none = await answerQuestion(folder, { kind: 'top', metric: 'efficiency', stat: 'avg', direction: 'high', period: datesPeriod('2025-01-01', '2025-12-31'), filters: NO_FILTERS, limit: 10 } satisfies Query);
    expect(none.sentence).toBe('No run 2025-01-01 – 2025-12-31 has a value of efficiency to answer with.');
    expect(sentenceOf({ kind: 'best', window: { kind: 'distance', target: 5000 }, period: datesPeriod('2025-01-01', '2025-12-31'), filters: NO_FILTERS, limit: 10 }, 'speed', [], [], null)).toBe('No run 2025-01-01 – 2025-12-31 has a stretch of 5 km to answer with.');
    // A criteria block's tolerances are the relaxed ones.
    expect(defaultTolerances('criteria')).toEqual(CRITERIA_TOLERANCES);
  });
});
