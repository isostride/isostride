import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeDayStates, contextFor, joinContext } from '@/lib/context';
import { readGear, writeGear, type Gear, readRunTags, writeRunTags } from '@/lib/gear';
import { PATHS, readJson } from '@/lib/fs';
import { importFolder } from '@/lib/pipeline';
import { type RunIndexRow, type RunsIndex } from '@/lib/kernel';
import { FILES, makeDataFolder } from '../support/fixtures';

const row = (startTime: string, id = startTime.slice(0, 10)): RunIndexRow => ({
  id, startTime, file: `fit/${id}.fit`, device: 'COROS PACE 4', distance: 10000, duration: 3000, avgSpeed: 3.33,
  avgHeartRate: 150, temperature: null, hasGps: true, laps: 1, algorithmVersion: 1,
});
const shoesA: Gear = { id: 'a', name: 'Shoes A', type: 'shoes', from: '2026-08-03', to: '2026-10-31' };
const shoesB: Gear = { id: 'b', name: 'Shoes B', type: 'shoes', from: '2026-09-01', to: null };
const armBand: Gear = { id: 'hr', name: 'Arm band', type: 'hrSensor', from: '2026-10-15', to: null };
const noTags = { dictionary: { workoutTypes: [], techniqueCues: [] }, tags: {} };

describe('Gear register', () => {
  it('Register shoes', async () => {
    const folder = await makeDataFolder([]);
    expect(await readGear(folder)).toEqual([]);
    await writeGear(folder, [shoesA]);
    expect(await readGear(folder)).toEqual([shoesA]);
    await expect(fs.access(path.join(folder.root, PATHS.gear))).resolves.toBeUndefined();
  });

  it('Change gear date range', async () => {
    const folder = await makeDataFolder([]);
    await writeGear(folder, [armBand]);
    await writeGear(folder, (await readGear(folder)).map((g) => (g.id === 'hr' ? { ...g, from: '2026-10-12' } : g)));
    expect((await readGear(folder))[0].from).toBe('2026-10-12');
  });
});

describe('Run tags', () => {
  it('Tag a run', async () => {
    const folder = await makeDataFolder([FILES.pace4]);
    await importFolder(folder);
    const file = await readRunTags(folder);
    file.dictionary.techniqueCues.push('high cadence');
    file.tags['20261109-190552'] = { workoutType: 'tempo', techniqueCue: 'high cadence', note: 'windy' };
    await writeRunTags(folder, file);
    await joinContext(folder);
    const saved = JSON.parse(await fs.readFile(path.join(folder.root, PATHS.runTags), 'utf8'));
    expect(saved.tags['20261109-190552']).toEqual({ workoutType: 'tempo', techniqueCue: 'high cadence', note: 'windy' });
    const index = (await readJson<RunsIndex>(folder, PATHS.runsIndex))!;
    expect(index.runs[0]).toMatchObject({ workoutType: 'tempo', techniqueCue: 'high cadence', note: 'windy' });
  });
});
