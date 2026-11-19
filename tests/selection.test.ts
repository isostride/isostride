import { describe, expect, it } from 'vitest';
import { definitionFromSelection, readDefinitions, selectionOptions, writeDefinitions } from '@/lib/blocks/definitions';
import { detectInstances } from '@/lib/blocks/detect';
import { runBlocks } from '@/lib/blocks/pipeline';
import { PATHS, readJson } from '@/lib/fs/folder';
import { resample } from '@/lib/geo/geo';
import { importFolder, type RunFile, type RunsIndex } from '@/lib/ingest/importFolder';
import { FILES, makeDataFolder } from './support/fixtures';

async function nov9() {
  const folder = await makeDataFolder([FILES.pace4]);
  await importFolder(folder);
  const run = (await readJson<RunFile>(folder, PATHS.runFile('20261109-190552')))!;
  const row = (await readJson<RunsIndex>(folder, PATHS.runsIndex))!.runs[0];
  return { folder, run, row };
}

describe('Definition from selection', () => {
  it('Definition from map selection', async () => {
    // A stretch of about 1 km selected on the map, minutes 20–24 of the 9 Nov run.
    const { folder, run, row } = await nov9();
    expect(selectionOptions(run, 1200, 1440)).toContain('route');
    const def = definitionFromSelection(run, 1200, 1440, 'route');
    expect(def).toMatchObject({ origin: 'manual', status: 'active' });
    expect(def.params.type).toBe('route');
    if (def.params.type !== 'route') return;
    expect(def.params.length).toBeGreaterThan(800);
    expect(def.name).toMatch(/^\d\.\d km \w+-bound, pace \d:\d\d–\d:\d\d$/);
    expect(def.tolerances.paceMax! - def.tolerances.paceMin!).toBe(30);
    // The run's own pass over the selection is an instance of it.
    expect(detectInstances(def, run, row, resample(run.samples.lat, run.samples.lon, run.samples.t)).length).toBe(1);
    await writeDefinitions(folder, [def]);
    await runBlocks(folder);
    expect((await readDefinitions(folder))[0].id).toBe(def.id);
  });

  it('Definition from chart selection', async () => {
    // The 25-minute tempo lap selected on the pace chart (lap 2: 744 s to about 31 min).
    const { run } = await nov9();
    const lap = run.laps[1];
    expect(selectionOptions(run, lap.start + 5, lap.end - 5)).toContain('structure');
    const def = definitionFromSelection(run, lap.start + 5, lap.end - 5, 'structure');
    expect(def.params).toEqual({ type: 'structure', kind: 'time', target: 1500, tolerance: 0.03 });
    expect(def.name).toBe('25-minute lap');
    const steady = definitionFromSelection(run, lap.start + 60, lap.start + 360, 'steady');
    expect(steady.params).toEqual({ type: 'steady', minDuration: 300 });
  });
});
