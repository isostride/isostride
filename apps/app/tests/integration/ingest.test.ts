import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PATHS, listFitFiles, readJson, readManifest, unseenFitFiles } from '@/lib/fs';
import { importFolder } from '@/lib/pipeline';
import { type RunFile, type RunsIndex, ALGORITHM_VERSION } from '@/lib/kernel';
import { parseFit } from '@/lib/ingest';
import { FILES, TEST_DATA, addFile, checksums, makeDataFolder, recordMeasure } from '../support/fixtures';

const runs = async (folder: Awaited<ReturnType<typeof makeDataFolder>>) =>
  (await readJson<RunsIndex>(folder, PATHS.runsIndex))!.runs;

describe('Import FIT files', () => {
  it('Import new FIT files', async () => {
    const folder = await makeDataFolder([FILES.pace4, FILES.pace3, FILES.pace4First]);
    const report = await importFolder(folder);
    expect(report.imported).toBe(3);
    const index = await runs(folder);
    expect(index).toHaveLength(3);
    for (const row of index) {
      const run = (await readJson<RunFile>(folder, PATHS.runFile(row.id)))!;
      expect(run.samples.t.length).toBeGreaterThan(100);
      expect(run.laps.length).toBeGreaterThan(0);
    }
    const manifest = (await readManifest(folder))!;
    expect(Object.values(manifest.files).every((f) => f.status === 'imported')).toBe(true);
  });

  it('Only new files imported', async () => {
    const folder = await makeDataFolder([FILES.pace4, FILES.pace3, FILES.pace4First]);
    await importFolder(folder);
    await addFile(folder, FILES.later);
    const report = await importFolder(folder);
    expect(report.skipped).toBe(3);
    expect(report.outcomes.map((o) => o.file)).toEqual([`fit/${FILES.later}`]);
    expect(await runs(folder)).toHaveLength(4);
  });
});

describe('New runs imported by themselves', () => {
  it('Unseen files found after the first import', async () => {
    const folder = await makeDataFolder([FILES.pace3, FILES.pace4]);
    // The FIT files of the folder (in fit/), and none counted as unseen before the first import.
    expect(await listFitFiles(folder)).toEqual([`fit/${FILES.pace3}`, `fit/${FILES.pace4}`]);
    expect(await unseenFitFiles(folder)).toEqual([]);
    await importFolder(folder);
    expect(await unseenFitFiles(folder)).toEqual([]);
    // A run dropped into the folder is unseen until the next import, which reads only it.
    await addFile(folder, FILES.later);
    expect(await unseenFitFiles(folder)).toEqual([`fit/${FILES.later}`]);
    const report = await importFolder(folder);
    expect(report.imported).toBe(1);
    expect(report.skipped).toBe(2);
    expect(await unseenFitFiles(folder)).toEqual([]);
  });
});

describe('No duplicate runs', () => {
  it('Repeated import adds nothing', async () => {
    const folder = await makeDataFolder([FILES.pace4, FILES.pace3]);
    await importFolder(folder);
    const before = await fs.readFile(path.join(folder.root, PATHS.runsIndex), 'utf8');
    const runsBefore = (await fs.readdir(path.join(folder.root, PATHS.runs))).length;
    const report = await importFolder(folder);
    const runsAfter = (await fs.readdir(path.join(folder.root, PATHS.runs))).length;
    const rows = (s: string) => (JSON.parse(s) as RunsIndex).runs.length;
    const after = await fs.readFile(path.join(folder.root, PATHS.runsIndex), 'utf8');
    await recordMeasure('repeatRecordsAdded', report.imported + (runsAfter - runsBefore) + (rows(after) - rows(before)));
    expect(report.imported).toBe(0);
    expect(report.outcomes).toHaveLength(0);
    expect(await fs.readFile(path.join(folder.root, PATHS.runsIndex), 'utf8')).toBe(before);
  });

  it('Renamed copy skipped', async () => {
    const folder = await makeDataFolder([FILES.pace4]);
    await importFolder(folder);
    await addFile(folder, FILES.pace4, 'run-1109 (1).fit');
    const report = await importFolder(folder);
    expect(report.duplicates).toBe(1);
    expect(report.outcomes[0]).toMatchObject({ file: 'fit/run-1109 (1).fit', status: 'duplicate', runId: '20261109-190552' });
    expect(await runs(folder)).toHaveLength(1);
  });
});

describe('Read all FIT fields', () => {
  // Values checked by hand in the raw records of the 9 Nov 2026 run (COROS PACE 4).
  const run = async () => parseFit(new Uint8Array(await fs.readFile(path.join(TEST_DATA, FILES.pace4))));

  it('All fields read', async () => {
    const r = await run();
    expect(r.startTime).toBe('2026-11-09T19:05:52.000Z');
    expect(r.device).toBe('COROS PACE 4');
    expect(r.distance).toBeCloseTo(9348.62, 2);
    expect(r.duration).toBeCloseTo(2597.49, 2);
    expect(r.samples.t).toHaveLength(2598);
    const i = 500;
    const s = r.samples;
    expect(s.t[i]).toBe(510);
    expect(s.speed[i]).toBeCloseTo(3.142, 3);
    expect(s.heartRate[i]).toBe(126);
    expect(s.cadence[i]).toBe(162);
    expect(s.groundContactTime[i]).toBe(262);
    expect(s.verticalOscillation[i]).toBe(82);
    expect(s.stepLength[i]).toBe(1030);
    expect(s.power[i]).toBe(193);
    expect(s.altitude[i]).toBe(4);
    expect(s.lat[i]).toBeCloseTo(41.395052, 5);
    expect(s.lon[i]).toBeCloseTo(2.206598, 5);
    expect(r.laps).toHaveLength(3);
    expect(r.laps[0]).toMatchObject({ start: 0, distance: 2000 });
    expect(r.laps[0].duration).toBeCloseTo(682.39, 2);
  });

  it('COROS developer fields read', async () => {
    const r = await run();
    expect(r.samples.effortPace[500]).toBeCloseTo(3.141, 3);
    expect(r.samples.legSpringStiffness[500]).toBeCloseTo(9.3, 3);
    expect(r.samples.effortPace.filter((v) => v !== null).length).toBeGreaterThan(2000);
  });

  it('Heart rate source recorded', async () => {
    const r = await run();
    // The COROS file names only the watch; the gear register says which sensor was worn.
    expect(r.sources.heartRate).toBe('COROS PACE 4');
    const old = parseFit(new Uint8Array(await fs.readFile(path.join(TEST_DATA, FILES.pace3))));
    expect(old.sources.heartRate).toBe('COROS PACE 3');
  });
});

describe('FIT files untouched', () => {
  it('FIT files unchanged', async () => {
    const folder = await makeDataFolder([FILES.pace4, FILES.pace3, FILES.hike]);
    const before = await checksums(path.join(folder.root, 'fit'));
    await importFolder(folder);
    await importFolder(folder);
    expect(await checksums(path.join(folder.root, 'fit'))).toEqual(before);
  });
});

describe('Skip unreadable FIT file', () => {
  it('Damaged file skipped', async () => {
    const folder = await makeDataFolder([FILES.pace4, FILES.pace3]);
    await fs.writeFile(path.join(folder.root, 'fit', 'broken.fit'), Buffer.from('not a fit file at all'));
    await addFile(folder, FILES.hike);
    const report = await importFolder(folder);
    expect(report.imported).toBe(2);
    expect(report.errors).toBe(2);
    const manifest = (await readManifest(folder))!;
    expect(manifest.files['fit/broken.fit']).toEqual({ status: 'error', reason: 'not a FIT file' });
    expect(manifest.files[`fit/${FILES.hike}`]).toEqual({ status: 'error', reason: 'not a run (sport: hiking)' });
    // Tried again on the next import.
    const again = await importFolder(folder);
    expect(again.outcomes.map((o) => o.file).sort()).toEqual([`fit/${FILES.hike}`, 'fit/broken.fit']);
  });
});

describe('Import time budget', () => {
  it('Run imported within 5 s', async () => {
    const folder = await makeDataFolder([FILES.pace4, FILES.pace3, FILES.pace4First]);
    const report = await importFolder(folder);
    const max = Math.max(...report.outcomes.map((o) => o.seconds));
    await recordMeasure('importMaxSeconds', max);
    expect(max).toBeLessThanOrEqual(5);
  });
});

describe('Record algorithm version', () => {
  it('Derived files carry version', async () => {
    const folder = await makeDataFolder([FILES.pace4]);
    await importFolder(folder);
    const index = (await readJson<RunsIndex>(folder, PATHS.runsIndex))!;
    expect(index.algorithmVersion).toBe(ALGORITHM_VERSION);
    const run = (await readJson<RunFile>(folder, PATHS.runFile(index.runs[0].id)))!;
    expect(run.algorithmVersion).toBe(ALGORITHM_VERSION);
    expect((await readManifest(folder))!.algorithmVersion).toBe(ALGORITHM_VERSION);
    // Every file under derived/, blocks included, records the version.
    const walk = async (dir: string): Promise<string[]> =>
      (await Promise.all((await fs.readdir(dir, { withFileTypes: true })).map((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])))).flat();
    const files = await walk(path.join(folder.root, PATHS.derived));
    expect(files.length).toBeGreaterThanOrEqual(6);
    const without: string[] = [];
    for (const f of files) if (JSON.parse(await fs.readFile(f, 'utf8')).algorithmVersion !== ALGORITHM_VERSION) without.push(f);
    await recordMeasure('derivedFilesWithoutVersion', without.length);
    expect(without).toEqual([]);
  });
});

describe('Columnar JSON format', () => {
  it('Run file is columnar', async () => {
    const folder = await makeDataFolder([FILES.pace4]);
    await importFolder(folder);
    const file = path.join(folder.root, PATHS.runFile('20261109-190552'));
    const run = JSON.parse(await fs.readFile(file, 'utf8')) as RunFile;
    const n = run.samples.t.length;
    for (const [name, col] of Object.entries(run.samples)) expect(col, name).toHaveLength(n);
    const size = (await fs.stat(file)).size;
    await recordMeasure('runFileMaxKB', Math.round((size / 1024) * 10) / 10);
    expect(size).toBeLessThanOrEqual(300 * 1024);
  });
});
