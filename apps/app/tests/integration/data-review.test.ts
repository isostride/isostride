import { describe, expect, it } from 'vitest';
import { PATHS, emptyManifest, filesToImport, isOutdated, readJson, readManifest, writeManifest } from '@/lib/fs';
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

  it('An import cut off keeps the files it had handled', async () => {
    const folder = await makeDataFolder([FILES.pace3, FILES.pace4First, FILES.pace4]);
    // Written after each file here (after each 50 in the app); the tab closes as the third file starts.
    const cut = importRuns(folder, { checkpoint: 1, onProgress: (p) => { if (p.done === 2) throw new Error('closed'); } });
    await expect(cut).rejects.toThrow('closed');
    const manifest = (await readManifest(folder))!;
    expect(Object.values(manifest.files).map((f) => f.status)).toEqual(['imported', 'imported']);
    expect(manifest.joined).toBe(false);
    expect((await readJson<RunsIndex>(folder, PATHS.runsIndex))!.runs).toHaveLength(2);
    // The next import reads the third file alone, and joins the three.
    const report = await importFolder(folder);
    expect([report.imported, report.skipped]).toEqual([1, 2]);
    const done = (await readJson<RunsIndex>(folder, PATHS.runsIndex))!;
    expect(done.runs).toHaveLength(3);
    expect(done.runs.every((r) => typeof r.load === 'number')).toBe(true);
    expect((await readManifest(folder))!.joined).toBe(true);
  }, 120_000);

  it('An import cut off between the index and the manifest', async () => {
    const folder = await makeDataFolder([FILES.pace4, FILES.hike]);
    await importRuns(folder);
    const hike = Object.entries((await readManifest(folder))!.files).find(([, f]) => f.status === 'error')!;
    // The tab closed once the index was written and before the manifest: the manifest of before, the run unseen.
    await writeManifest(folder, { ...emptyManifest(), files: { [hike[0]]: hike[1] } });
    const report = await importFolder(folder);
    // The run is no duplicate of itself, and its context is joined (it stayed without load, form and segments).
    expect([report.imported, report.duplicates]).toEqual([0, 0]);
    const manifest = (await readManifest(folder))!;
    expect(Object.values(manifest.files).map((f) => f.status).sort()).toEqual(['error', 'imported']);
    expect(manifest.joined).toBe(true);
    expect((await readJson<RunsIndex>(folder, PATHS.runsIndex))!.runs.map((r) => typeof r.load)).toEqual(['number']);
    // The hike is not a run however often it is read: it is not read again (it was, at every import).
    expect(report.outcomes).toEqual([expect.objectContaining({ status: 'imported' })]);
    expect((await importFolder(folder)).skipped).toBe(2);
  }, 120_000);

  it('Records far outside the session are not of the run', () => {
    // The watch's clock is set during the run: a record a year on. And two records out of their order.
    const at = (s: number) => new Date(Date.UTC(2026, 5, 7, 8, 0, s));
    const record = (s: number) => ({ timestamp: at(s), enhancedSpeed: 3, distance: 3 * s });
    const messages = {
      sessionMesgs: [{ sport: 'running', startTime: at(0), totalElapsedTime: 40, totalTimerTime: 40, totalDistance: 120 }],
      recordMesgs: [record(0), record(10), record(30), record(20), record(40), { ...record(40), timestamp: new Date(Date.UTC(2027, 5, 7, 8)) }],
    };
    expect(runFromMessages(messages).samples.t).toEqual([0, 10, 20, 30, 40]);
  });

  it('A developer field’s scale and offset applied', () => {
    // A field kept as whole numbers, a tenth each, 20 under its value: 425 in the file is 42.5 − 20 = 22.5.
    const at = (s: number) => new Date(Date.UTC(2026, 5, 7, 8, 0, s));
    const messages = {
      sessionMesgs: [{ sport: 'running', startTime: at(0), totalElapsedTime: 20, totalTimerTime: 20, totalDistance: 60 }],
      fieldDescriptionMesgs: [
        { key: 0, developerDataIndex: 0, fieldName: 'Core Temp', units: 'C', scale: 10, offset: 20 },
        { key: 1, developerDataIndex: 0, fieldName: 'Plain', units: 'W' },
      ],
      recordMesgs: [0, 10, 20].map((s) => ({ timestamp: at(s), enhancedSpeed: 3, distance: 3 * s, developerFields: { 0: 425 + s, 1: 250 } })),
    };
    const parsed = runFromMessages(messages);
    expect(parsed.samples.values['dev.coreTemp']).toEqual([22.5, 23.5, 24.5]);
    // A field that names neither is kept as the file holds it.
    expect(parsed.samples.values['dev.plain']).toEqual([250, 250, 250]);
  });
});
