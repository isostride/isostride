import { describe, expect, it } from 'vitest';
import { asRuleDefinition, definitionFromRoute, definitionFromRule, readDefinitions, ruleName, ruleOf, writeDefinitions, type BlockInstancesFile } from '@/lib/blocks';
import { detectInstances, runBlocks, trackOfStretch } from '@/lib/detection';
import { PATHS, readJson } from '@/lib/fs';
import { resample } from '@/lib/geo';
import { importFolder } from '@/lib/pipeline';
import { type RunFile, type RunsIndex } from '@/lib/kernel';
import { FILES, makeDataFolder } from '../support/fixtures';

async function nov9() {
  const folder = await makeDataFolder([FILES.pace4]);
  await importFolder(folder);
  const run = (await readJson<RunFile>(folder, PATHS.runFile('20261109-190552')))!;
  const row = (await readJson<RunsIndex>(folder, PATHS.runsIndex))!.runs[0];
  return { folder, run, row };
}

describe('Definition from selection', () => {
  it('Definition from map selection', async () => {
    // A stretch of about 1 km selected on the map, minutes 20–24 of the 9 Nov run, kept as its route.
    const { folder, run, row } = await nov9();
    const def = definitionFromRoute(trackOfStretch(run, 1200, 1440));
    expect(def).toMatchObject({ origin: 'manual', status: 'active' });
    expect(def.params.type).toBe('rule');
    if (def.params.type !== 'rule' || def.params.shape.type !== 'route') throw new Error('not a route rule');
    expect(def.params.shape.length).toBeGreaterThan(800);
    expect(def.name).toMatch(/^\d\.\d km \w+-bound, any pace$/);
    // The run's own pass over the selection is a segment of it.
    expect(detectInstances(def, run, row, resample(run.samples.lat, run.samples.lon, run.samples.t)).length).toBe(1);
    await writeDefinitions(folder, [def]);
    await runBlocks(folder);
    expect((await readDefinitions(folder))[0].id).toBe(def.id);
    expect((await readJson<BlockInstancesFile>(folder, PATHS.blockInstances))!.instances.filter((i) => i.definitionId === def.id)).toHaveLength(1);
  });

  it('Definition from chart selection', async () => {
    // The 25-minute tempo lap (lap 2) as the one model has it: laps set up as 25 minutes.
    const { run, row } = await nov9();
    const lap = run.laps[1];
    const rule = ruleOf({ type: 'lap', planned: { kind: 'time', target: 1500, tolerance: 0.03 } });
    expect(ruleName(rule)).toBe('Laps set up as 25 min');
    const def = definitionFromRule('', rule);
    const found = detectInstances(def, run, row, []);
    expect(found.map((i) => [i.start, i.end])).toEqual([[lap.start, lap.end]]);
    // An older workout-lap block reads as that rule and finds the same lap.
    const older = asRuleDefinition({ ...def, params: { type: 'structure', kind: 'time', target: 1500, tolerance: 0.03 } as const });
    expect(older.params).toEqual({ type: 'rule', ...rule });
  });
});
