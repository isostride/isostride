import { describe, expect, it } from 'vitest';
import { PATHS, filesToImport, isOutdated, readJson, readManifest, writeManifest } from '@/lib/fs';
import { importRuns, runFromMessages } from '@/lib/ingest';
import { ALGORITHM_VERSION, type RunsIndex } from '@/lib/kernel';
import { LOAD_SUMMARY_VERSION, summariesCurrent } from '@/lib/load';
import { importFolder } from '@/lib/pipeline';
import { FILES, addFile, makeDataFolder } from '../support/fixtures';

/**
 * The review of the data path (26 Nov 2026, the runner's "przegladnij aplikacje raz jeszcze ... pod katem
 * modeli ale nie tylko", then "tak zacznij od poczzatku ... i przejdz przez wszystkie").
 */
describe('Data path reviewed', () => {
  it('An import cut off is finished by the next one', async () => {
    const folder = await makeDataFolder([FILES.pace4, FILES.pace3]);
    // The runs are read and the index written; the tab is closed before their context is joined.
    await importRuns(folder);
    const cut = (await readJson<RunsIndex>(folder, PATHS.runsIndex))!;
    expect(cut.runs).toHaveLength(2);
    expect(cut.runs.every((r) => r.load === undefined)).toBe(true);
    expect((await readManifest(folder))!.joined).toBe(false);
    expect((await filesToImport(folder)).pending).toBe(true);
    // The next import finds no new file, and finishes the one before: the loads, the form, the segments.
    const report = await importFolder(folder);
    expect(report.imported).toBe(0);
    const done = (await readJson<RunsIndex>(folder, PATHS.runsIndex))!;
    expect(done.runs.every((r) => typeof r.load === 'number' && typeof r.form === 'number')).toBe(true);
    expect((await readManifest(folder))!.joined).toBe(true);
    expect((await filesToImport(folder)).pending).toBe(false);
    expect(await readJson(folder, PATHS.blockInstances)).not.toBeNull();
  }, 120_000);

  it('New files leave an older folder marked for its rebuild', async () => {
    const folder = await makeDataFolder([FILES.pace4]);
    await importFolder(folder);
    // The folder as an older version of the app built it.
    await writeManifest(folder, { ...(await readManifest(folder))!, algorithmVersion: ALGORITHM_VERSION - 1 });
    expect(isOutdated(await readManifest(folder))).toBe(true);
    // A run dropped in and imported: its other runs are still the older version's, and the mark stays.
    await addFile(folder, FILES.later);
    expect((await importFolder(folder)).imported).toBe(1);
    expect(isOutdated(await readManifest(folder))).toBe(true);
    expect((await filesToImport(folder)).outdated).toBe(true);
  }, 120_000);

  it('Summaries of another version are made again', () => {
    expect(summariesCurrent({ version: LOAD_SUMMARY_VERSION, algorithmVersion: ALGORITHM_VERSION })).toBe(true);
    expect(summariesCurrent({ version: LOAD_SUMMARY_VERSION - 1, algorithmVersion: ALGORITHM_VERSION })).toBe(false);
    expect(summariesCurrent({ version: LOAD_SUMMARY_VERSION, algorithmVersion: ALGORITHM_VERSION - 1 })).toBe(false);
    expect(summariesCurrent(null)).toBe(false);
  });

  it('The run of a file of several sports', () => {
    // A swim of 10 minutes, then a run of 20 minutes, in one file: records every 10 s, a lap each.
    const at = (s: number) => new Date(Date.UTC(2026, 5, 7, 8, 0, s));
    const record = (s: number, speed: number, distance: number) => ({ timestamp: at(s), enhancedSpeed: speed, distance, heartRate: 150 });
    const swim = Array.from({ length: 60 }, (_, k) => record(10 * k, 1, 10 * k));
    const run = Array.from({ length: 121 }, (_, k) => record(700 + 10 * k, 3, 600 + 30 * k));
    const messages = {
      sessionMesgs: [
        { sport: 'swimming', startTime: at(0), totalElapsedTime: 600, totalTimerTime: 600, totalDistance: 600 },
        { sport: 'running', startTime: at(700), totalElapsedTime: 1200, totalTimerTime: 1200, totalDistance: 3600 },
      ],
      recordMesgs: [...swim, ...run],
      lapMesgs: [
        { startTime: at(0), totalElapsedTime: 600, totalTimerTime: 600, totalDistance: 600 },
        { startTime: at(700), totalElapsedTime: 1200, totalTimerTime: 1200, totalDistance: 3600 },
      ],
    };
    const parsed = runFromMessages(messages);
    // The run leg alone: its start, its records from its own first second and metre, its lap.
    expect(parsed.startTime).toBe(at(700).toISOString());
    expect([parsed.distance, parsed.duration]).toEqual([3600, 1200]);
    expect(parsed.samples.t).toHaveLength(121);
    expect([parsed.samples.t[0], parsed.samples.t[120]]).toEqual([0, 1200]);
    expect([parsed.samples.distance[0], parsed.samples.distance[120]]).toEqual([0, 3600]);
    expect(parsed.samples.values.speed!.every((v) => v === 3)).toBe(true);
    expect(parsed.laps).toEqual([{ start: 0, end: 1200, duration: 1200, distance: 3600 }]);
    // No running session in the file: not a run. One session: the file whole, as before.
    expect(() => runFromMessages({ ...messages, sessionMesgs: [messages.sessionMesgs[0]] })).toThrow(/not a run \(sport: swimming\)/);
    expect(runFromMessages({ ...messages, sessionMesgs: [messages.sessionMesgs[1]] }).samples.t).toHaveLength(181);
  });
});
