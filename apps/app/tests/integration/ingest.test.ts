import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PATHS, failedFitFiles, listFitFiles, readJson, readManifest, unseenFitFiles } from '@/lib/fs';
import { distance } from '@/lib/geo';
import { importFolder } from '@/lib/pipeline';
import { type RunFile, type RunsIndex, ALGORITHM_VERSION } from '@/lib/kernel';
import { metricKeyOfField, parseFit } from '@/lib/ingest';
import { Decoder, Stream } from '@garmin/fitsdk';
import { FILES, TEST_DATA, addFile, checksums, fitFixtures, makeDataFolder, recordMeasure } from '../support/fixtures';
import { buildWindows } from '@/lib/prepare';

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
    // The FIT files of the folder (in fit/), all of them unseen before the first import (which is by itself).
    expect(await listFitFiles(folder)).toEqual([`fit/${FILES.pace3}`, `fit/${FILES.pace4}`]);
    expect(await unseenFitFiles(folder)).toEqual([`fit/${FILES.pace3}`, `fit/${FILES.pace4}`]);
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

  it('A file that could not be read tried again when the app opens', async () => {
    const folder = await makeDataFolder([FILES.pace4]);
    await folder.writeBytes('fit/broken.fit', new TextEncoder().encode('not a FIT file'));
    await importFolder(folder);
    // Not unseen (the looks while the app is in use leave it), but found for the look when the app opens.
    expect(await unseenFitFiles(folder)).toEqual([]);
    expect(await failedFitFiles(folder)).toEqual(['fit/broken.fit']);
    await addFile(folder, FILES.pace3, 'broken.fit');
    expect((await importFolder(folder)).imported).toBe(1);
    expect(await failedFitFiles(folder)).toEqual([]);
  });

  it('An import that adds nothing reads no run again', async () => {
    // The review of 24 Nov 2026 ("czy nie przeliczasz rzeczy wielokrotnie"): a look that finds a file it
    // cannot read, or a duplicate, used to detect every segment over every run again.
    const folder = await makeDataFolder([FILES.pace4, FILES.pace3]);
    await importFolder(folder);
    await folder.writeBytes('fit/broken.fit', new TextEncoder().encode('not a FIT file'));
    const read = folder.readText.bind(folder);
    const runsRead: string[] = [];
    folder.readText = async (p: string) => { if (p.startsWith(`${PATHS.runs}/`)) runsRead.push(p); return read(p); };
    const report = await importFolder(folder);
    expect(report.imported).toBe(0);
    await recordMeasure('emptyImportRunFilesRead', runsRead.length);
    expect(runsRead).toEqual([]);
  });

  it('A file that is not a run not tried again', async () => {
    // A hike is read once: read again at every opening, it would still be no run (and the import would run for nothing).
    const folder = await makeDataFolder([FILES.pace4, FILES.hike]);
    await importFolder(folder);
    expect((await readManifest(folder))!.files[`fit/${FILES.hike}`].status).toBe('error');
    expect(await failedFitFiles(folder)).toEqual([]);
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
    expect((s.values.speed?.[i] ?? null)).toBeCloseTo(3.142, 3);
    expect((s.values.heartRate?.[i] ?? null)).toBe(126);
    expect((s.values.cadence?.[i] ?? null)).toBe(162);
    expect((s.values.groundContactTime?.[i] ?? null)).toBe(262);
    expect((s.values.verticalOscillation?.[i] ?? null)).toBe(82);
    expect((s.values.stepLength?.[i] ?? null)).toBe(1030);
    expect((s.values.power?.[i] ?? null)).toBe(193);
    expect((s.values.altitude?.[i] ?? null)).toBe(4);
    // The position, read from the semicircles of the file: a place on Earth, and a second's step of the size
    // of the speed (no coordinate of the runner's routes is written here: the repository is public).
    const at = (k: number) => ({ lat: s.lat[k]!, lon: s.lon[k]! });
    expect(Math.abs(at(i).lat)).toBeLessThan(90);
    expect(Math.abs(at(i).lon)).toBeLessThan(180);
    expect(distance(at(i), at(i + 10)) / 10).toBeCloseTo(s.values.speed![i]!, 0);
    expect(r.laps).toHaveLength(3);
    expect(r.laps[0]).toMatchObject({ start: 0, distance: 2000 });
    expect(r.laps[0].duration).toBeCloseTo(682.39, 2);
    // The file's other numeric fields are metrics too, named and measured as the FIT profile has them.
    expect(r.metrics.find((m) => m.key === 'verticalRatio')).toMatchObject({ name: 'Vertical ratio', unit: '%', origin: 'standard', direction: 'neutral' });
    expect(s.values.verticalRatio?.filter((v) => v !== null).length).toBeGreaterThan(2000);
    // Running totals and the bookkeeping are not.
    expect(Object.keys(s.values)).not.toContain('accumulatedPower');
    expect(Object.keys(s.values)).not.toContain('enhancedSpeed');
  });

  it('Developer fields read', async () => {
    const r = await run();
    expect((r.samples.values.effortPace?.[500] ?? null)).toBeCloseTo(3.141, 3);
    expect((r.samples.values.legSpringStiffness?.[500] ?? null)).toBeCloseTo(9.3, 3);
    expect((r.samples.values.effortPace ?? []).filter((v) => v !== null).length).toBeGreaterThan(2000);
    // COROS' Form Power and Air Power, left out before: metrics in watts, named by the file.
    expect(r.metrics.find((m) => m.key === 'dev.formPower')).toMatchObject({ name: 'Form Power', unit: 'W', origin: 'developer', direction: 'neutral' });
    expect(r.metrics.find((m) => m.key === 'dev.airPower')).toMatchObject({ name: 'Air Power', unit: 'W', origin: 'developer' });
    expect((r.samples.values['dev.formPower'] ?? []).filter((v) => v !== null).length).toBeGreaterThan(2000);
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
    // The file that may have been cut short is tried again on the next import; the hike, not a run however
    // often it is read, is not.
    const again = await importFolder(folder);
    expect(again.outcomes.map((o) => o.file)).toEqual(['fit/broken.fit']);
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
    const { values, ...fixed } = run.samples;
    for (const [name, col] of [...Object.entries(fixed), ...Object.entries(values)]) expect(col, name).toHaveLength(n);
    for (const [name, col] of Object.entries(run.windows.values)) expect(col, name).toHaveLength(run.windows.start.length);
    const size = (await fs.stat(file)).size;
    await recordMeasure('runFileMaxKB', Math.round((size / 1024) * 10) / 10);
    expect(size).toBeLessThanOrEqual(300 * 1024);
  });
});

const GARMIN = path.resolve(__dirname, '../fixtures/garmin');
const garmin = async (f: string) => parseFit(new Uint8Array(await fs.readFile(path.join(GARMIN, f))));

/** The numeric fields of a FIT file's records. */
async function recordFields(file: string): Promise<Set<string>> {
  const d = new Decoder(Stream.fromByteArray(Array.from(await fs.readFile(file))));
  const { messages } = d.read({ applyScaleAndOffset: true, expandSubFields: true, expandComponents: true, convertTypesToStrings: true, convertDateTimesToDates: true });
  const out = new Set<string>();
  for (const r of messages.recordMesgs ?? []) for (const [k, v] of Object.entries(r)) if (typeof v === 'number') out.add(k);
  return out;
}

describe('Watches other than COROS', () => {
  it('Garmin runs read', async () => {
    // A fenix 2 run: running dynamics as Garmin writes them, under the app's names.
    const f2 = await garmin('fenix2-run.fit');
    expect(f2.device).toMatch(/fenix2/i);
    for (const k of ['speed', 'heartRate', 'cadence', 'groundContactTime', 'verticalOscillation', 'altitude', 'temperature']) expect(f2.samples.values[k], k).toBeDefined();
    expect(f2.metrics.some((m) => m.origin === 'developer')).toBe(false);
    // A fenix 5 run holds fields the COROS files do not: each one a metric with its unit.
    const f5 = await garmin('fenix5-smart-recording-run.fit');
    expect(f5.metrics.find((m) => m.key === 'stanceTimeBalance')).toMatchObject({ name: 'Stance time balance', unit: '%' });
    expect(f5.metrics.find((m) => m.key === 'stanceTimePercent')).toMatchObject({ unit: '%' });
    expect(f5.samples.values.verticalRatio).toBeDefined();
    // A swim with developer fields is no run.
    await expect(garmin('fr935-swim.fit')).rejects.toThrow(/not a run/);
  });

  it('Smart recording keeps its moving windows', async () => {
    // Garmin's Smart recording: a record every 1 to 9 s. Every window of the running is moving.
    const f5 = await garmin('fenix5-smart-recording-run.fit');
    const gaps = f5.samples.t.slice(1).map((t, i) => t - f5.samples.t[i]);
    expect(Math.max(...gaps)).toBeGreaterThanOrEqual(5);
    const w = buildWindows(f5.samples);
    const moving = w.start.map((_, i) => i).filter((i) => (w.values.speed?.[i] ?? 0) >= 0.5 && w.n[i] > 0 && i < w.start.length - 1);
    expect(moving.length).toBeGreaterThan(2);
    for (const i of moving) expect(w.flags.stopped[i], `window ${i}: ${w.n[i]} samples`).toBe(false);
  });

  it('Every numeric field read', async () => {
    // Every numeric field of the records of the test files is a metric of the run, but the time,
    // the position, the distance, the running totals and the watch's bookkeeping.
    const files = [...(await fitFixtures()).filter((f) => f.includes('_run_')).slice(0, 12).map((f) => path.join(TEST_DATA, f)), path.join(GARMIN, 'fenix2-run.fit'), path.join(GARMIN, 'fenix5-smart-recording-run.fit')];
    let dropped = 0;
    for (const file of files) {
      const run = parseFit(new Uint8Array(await fs.readFile(file)));
      const keys = new Set(run.metrics.map((m) => m.key));
      for (const field of await recordFields(file)) {
        const key = metricKeyOfField(field);
        if (key !== null && !keys.has(key)) { dropped++; console.error(`${path.basename(file)}: ${field} not read`); }
      }
    }
    await recordMeasure('ingestFieldsDropped', dropped);
    expect(dropped).toBe(0);
  });
});
