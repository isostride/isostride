import { describe, expect, it } from 'vitest';
import { joinContext } from '@/lib/context';
import { PATHS, readJson, writeJson } from '@/lib/fs';
import type { RunsIndex } from '@/lib/kernel';
import { writeSettings, DEFAULT_PERFORMANCE } from '@/lib/settings';
import { makeDataFolder, recordMeasure } from '../support/fixtures';
import { rowFor, syntheticRun } from '../support/synthetic';

describe('Performance model', () => {
  it('Context load by the model', async () => {
    // Three runs on consecutive days: 30 min at 150 bpm and 250 W each.
    const folder = await makeDataFolder([]);
    const runs = ['2026-10-01', '2026-10-02', '2026-10-03'].map((d, k) => ({ ...syntheticRun(1800, () => ({ speed: 3, heartRate: 150, power: 250 })), id: `r${k}`, startTime: `${d}T07:00:00.000Z` }));
    await writeJson(folder, PATHS.runsIndex, { schemaVersion: 1, algorithmVersion: 1, runs: runs.map((r) => rowFor(r)) });
    for (const r of runs) await writeJson(folder, PATHS.runFile(r.id), r);
    const zones = { heartRate: [114, 133, 152, 171] };

    // Edwards: 30 min in Z3 is 90 a run; the third run's day has 180 over the 3 days before. The averages start
    // from the mean load of the first days, so a load the same every day leaves the form at zero.
    await writeSettings(folder, { schemaVersion: 1, zones, performance: { ...DEFAULT_PERFORMANCE, load: 'trimpEdwards' } });
    let index = (await joinContext(folder))!;
    expect(index.runs.map((r) => r.load)).toEqual([90, 90, 90]);
    expect(index.runs[2].load3).toBe(180);
    expect(index.runs[2].load7).toBe(180);
    expect(index.runs[2].form).toBe(0);
    // The summaries are kept: a change of model reads no run file.
    expect(Object.keys((await readJson<{ runs: object }>(folder, PATHS.loadSummaries))!.runs)).toEqual(['r0', 'r1', 'r2']);
    const reads: string[] = [];
    const readText = folder.readText.bind(folder);
    folder.readText = async (p: string) => { if (p.startsWith(`${PATHS.runs}/`)) reads.push(p); return readText(p); };

    // Power TSS against 250 W: 50 a run (half an hour at the threshold), the context following.
    await writeSettings(folder, { schemaVersion: 1, zones, performance: { ...DEFAULT_PERFORMANCE, load: 'powerTss', thresholdPower: 250 } });
    index = (await joinContext(folder))!;
    expect(index.runs.map((r) => r.load)).toEqual([50, 50, 50]);
    expect(index.runs[2].load3).toBe(100);
    expect((await readJson<RunsIndex>(folder, PATHS.runsIndex))!.runs[2].load3).toBe(100);
    // Fitness function "Model change reads no run file" (ADR "Load and form models").
    await recordMeasure('loadModelChangeRunFilesRead', reads.length);
    expect(reads).toEqual([]);
  });
});
