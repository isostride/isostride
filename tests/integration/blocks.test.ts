import fs from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { RECOMMENDATIONS_PATH, fromRecommendation, readDefinitions, writeDefinitions, type BlockDefinition, type BlockInstancesFile, type Recommendation, DEFAULT_TOLERANCES } from '@/lib/blocks';
import { detectInstances, runBlocks, recommend, detectRouteSegments } from '@/lib/detection';
import { PATHS, readJson } from '@/lib/fs';
import { resample } from '@/lib/geo';
import { importFolder, recomputeEverything } from '@/lib/pipeline';
import { type RunFile, type RunsIndex } from '@/lib/kernel';
import { parseFit } from '@/lib/ingest';
import { TEST_DATA, addFile, makeDataFolder, recordMeasure } from '../support/fixtures';
import type { NodeFolder } from '../support/nodeFolder';

/** Runs since 3 Aug 2026 (the spec's acceptance data) and the files with a 25-minute tempo lap. */
const ALL = (await fs.readdir(TEST_DATA)).filter((f) => f.endsWith('.fit')).sort();
const SINCE_AUG = ALL.filter((f) => f >= '2026-08-03');
/**
 * The runner's workouts with a lap set to 25 minutes, found in the files, one file per
 * workout (an export can hold the same activity twice, e.g. "x.fit" and "x (1).fit").
 */
const TEMPO_25 = [
  ...new Map(
    (
      await Promise.all(
        ALL.map(async (f) => {
          try {
            const run = parseFit(new Uint8Array(await fs.readFile(path.join(TEST_DATA, f))));
            return run.laps.some((l) => Math.abs(l.duration - 1500) <= 2) ? ([run.startTime, f] as const) : null;
          } catch {
            return null;
          }
        }),
      )
    )
      .filter((e): e is readonly [string, string] => e !== null)
      .sort((a, b) => a[0].localeCompare(b[0])),
  ).values(),
];
const runIdOf = async (folder: NodeFolder, day: string) => (await readJson<RunsIndex>(folder, PATHS.runsIndex))!.runs.find((r) => r.startTime.startsWith(day))!.id;

const recs = async (folder: NodeFolder) => (await readJson<{ recommendations: Recommendation[] }>(folder, RECOMMENDATIONS_PATH))!.recommendations;
const instances = async (folder: NodeFolder) => (await readJson<BlockInstancesFile>(folder, PATHS.blockInstances))!.instances;
const isPromenade = (r: Recommendation) =>
  r.params.type === 'route' && r.params.length >= 900 && r.params.length <= 1300 &&
  r.params.track.every((p) => p.lat > 41.385 && p.lat < 41.412 && p.lon > 2.19 && p.lon < 2.225);
const isTempo = (r: Recommendation) => r.params.type === 'structure' && r.params.kind === 'time' && r.params.target === 1500;

let all: NodeFolder;
beforeAll(async () => {
  all = await makeDataFolder(SINCE_AUG);
  await importFolder(all);
}, 120_000);

describe('Recommend route segment', () => {
  it('Promenade recommended', async () => {
    const promenade = (await recs(all)).filter(isPromenade);
    await recordMeasure('promenadeRecommended', promenade.length ? 1 : 0);
    expect(promenade.length).toBeGreaterThan(0);
    expect(promenade[0].instances).toBeGreaterThanOrEqual(5);
    expect(promenade[0].basis).toMatch(/route passed \d+ times/);
  });

  it('Pace band fits the passes', async () => {
    // The band is measured the way an instance's pace condition is (mean sample speed),
    // so a wait at a crossing does not push the band away from the passes it came from.
    const folder = await makeDataFolder(SINCE_AUG);
    await importFolder(folder);
    const routes = (await recs(folder)).filter((r) => r.params.type === 'route');
    await writeDefinitions(folder, routes.map((r) => fromRecommendation(r, 'active')));
    await runBlocks(folder);
    const found = await instances(folder);
    for (const d of await readDefinitions(folder)) {
      const paces = found.filter((i) => i.definitionId === d.id).map((i) => 1000 / i.metrics.speed!).sort((a, b) => a - b);
      const median = paces[Math.floor(paces.length / 2)];
      const centre = (d.tolerances.paceMin! + d.tolerances.paceMax!) / 2;
      // Centre snapped to 15 s, so within 7.5 s of the median, plus a little for passes
      // the recommendation and the detection cut slightly differently.
      expect(Math.abs(centre - median), d.name).toBeLessThanOrEqual(10);
    }
  }, 120_000);

  it('Four passes not enough', async () => {
    const folder = await makeDataFolder(SINCE_AUG.slice(-4));
    await importFolder(folder);
    expect((await recs(folder)).filter((r) => r.params.type === 'route')).toEqual([]);
  });
});

describe('Derive route segments', () => {
  it('Route segment derived', async () => {
    const segs = (await readJson<{ segments: { length: number; runs: number; track: { lat: number }[] }[] }>(all, PATHS.segments))!.segments;
    const seg = segs.find((s) => s.length >= 900 && s.length <= 1300 && s.runs >= 5)!;
    expect(seg).toBeDefined();
    // A reference point every 10 m.
    expect(seg.track.length).toBe(seg.length / 10 + 1);
  });
});

describe('Recommend workout structure', () => {
  it('Tempo recommended', async () => {
    const folder = await makeDataFolder(TEMPO_25);
    await importFolder(folder);
    const tempo = (await recs(folder)).find(isTempo);
    await recordMeasure('tempoRecommended', tempo ? 1 : 0);
    expect(tempo).toMatchObject({ name: '25-minute lap', runs: TEMPO_25.length });
  });

  it('Two workouts not enough', async () => {
    const folder = await makeDataFolder(TEMPO_25.slice(0, 2));
    await importFolder(folder);
    expect((await recs(folder)).find(isTempo)).toBeUndefined();
  });
});

describe('Accept or reject recommendation', () => {
  it('Accept recommendation', async () => {
    const folder = await makeDataFolder(TEMPO_25);
    await importFolder(folder);
    const rec = (await recs(folder)).find(isTempo)!;
    await writeDefinitions(folder, [fromRecommendation(rec, 'active')]);
    await runBlocks(folder);
    const defs = await readDefinitions(folder);
    expect(defs).toHaveLength(1);
    expect(defs[0]).toMatchObject({ origin: 'recommendation', status: 'active', name: '25-minute lap' });
    expect((await recs(folder)).find(isTempo)).toBeUndefined();
  });

  it('Reject recommendation', async () => {
    const folder = await makeDataFolder(TEMPO_25);
    await importFolder(folder);
    const rec = (await recs(folder)).find(isTempo)!;
    await writeDefinitions(folder, [fromRecommendation(rec, 'rejected')]);
    await runBlocks(folder);
    expect((await recs(folder)).find(isTempo)).toBeUndefined();
    expect((await instances(folder)).length).toBe(0);
  });
});

describe('Rejected not proposed again', () => {
  it('Rejected stays rejected', async () => {
    const folder = await makeDataFolder(SINCE_AUG.slice(0, 30));
    await importFolder(folder);
    const promenade = (await recs(folder)).find(isPromenade)!;
    await writeDefinitions(folder, [fromRecommendation(promenade, 'rejected')]);
    for (const f of SINCE_AUG.slice(30, 35)) await addFile(folder, f);
    await importFolder(folder);
    const same = (r: Recommendation) => r.params.type === 'route' && r.id === promenade.id;
    expect((await recs(folder)).find(same)).toBeUndefined();
    await recomputeEverything(folder);
    expect((await recs(folder)).find(same)).toBeUndefined();
  });
});

describe('Editable tolerances', () => {
  it('Change a tolerance', async () => {
    const folder = await makeDataFolder(TEMPO_25);
    await importFolder(folder);
    const def = fromRecommendation((await recs(folder)).find(isTempo)!, 'active');
    def.tolerances = { ...def.tolerances, cvMax: 0.1 };
    await writeDefinitions(folder, [def]);
    const saved = (await readDefinitions(folder))[0];
    expect(saved.tolerances).toEqual({ ...DEFAULT_TOLERANCES, effortBeforeMax: null, cvMax: 0.1 });
  });
});

describe('Detect in history', () => {
  it('New definition scans history', async () => {
    const folder = await makeDataFolder(TEMPO_25);
    await importFolder(folder);
    await writeDefinitions(folder, [fromRecommendation((await recs(folder)).find(isTempo)!, 'active')]);
    await runBlocks(folder);
    const found = await instances(folder);
    expect(new Set(found.map((i) => i.runId)).size).toBe(TEMPO_25.length);
  });

  it('Tolerance change redetects', async () => {
    const promenade = (await recs(all)).find(isPromenade)!;
    const narrow = fromRecommendation(promenade, 'active');
    await writeDefinitions(all, [narrow]);
    await runBlocks(all);
    const before = (await instances(all)).filter((i) => i.status === 'accepted').length;
    await writeDefinitions(all, [{ ...narrow, tolerances: { ...narrow.tolerances, paceMin: narrow.tolerances.paceMin! - 60, paceMax: narrow.tolerances.paceMax! + 60 } }]);
    await runBlocks(all);
    const after = (await instances(all)).filter((i) => i.status === 'accepted').length;
    expect(after).toBeGreaterThan(before);
    await writeDefinitions(all, []);
    await runBlocks(all);
  });
});

describe('Detect in new runs', () => {
  it('New run scanned', async () => {
    const folder = await makeDataFolder(TEMPO_25.slice(0, 4));
    await importFolder(folder);
    const tempo: BlockDefinition = { ...fromRecommendation({ id: 'r', name: '25-minute lap', params: { type: 'structure', kind: 'time', target: 1500, tolerance: 0.03 }, tolerances: { ...DEFAULT_TOLERANCES, effortBeforeMax: null }, runs: 0, instances: 0, basis: '' }, 'active') };
    await writeDefinitions(folder, [tempo]);
    await runBlocks(folder);
    expect((await instances(folder)).some((i) => i.runId === '20261109-190552')).toBe(false);
    await addFile(folder, TEMPO_25[4]);
    await importFolder(folder);
    expect((await instances(folder)).some((i) => i.runId === '20261109-190552')).toBe(true);
  });
});

describe('Store instance context', () => {
  it('Instance holds four layers', async () => {
    const folder = await makeDataFolder(TEMPO_25);
    await importFolder(folder);
    await writeDefinitions(folder, [fromRecommendation((await recs(folder)).find(isTempo)!, 'active')]);
    await runBlocks(folder);
    const inst = (await instances(folder)).find((i) => i.runId === '20261109-190552')!;
    expect(Object.keys(inst.context)).toEqual(['block', 'before', 'run', 'day']);
    expect(inst.context.block).toMatchObject({ duration: 1500 });
    expect(inst.context.before).toMatchObject({ lap: 2, minuteOfRun: 12, kmOfRun: 2 });
    expect(inst.context.run.device).toBe('COROS PACE 4');
    expect(inst.context.day).toHaveProperty('load7');
    expect(inst.profile.heartRate).toHaveLength(25);
    expect(inst.metrics.heartRate).toBeGreaterThan(100);
  });
});

describe('Three definition types', () => {
  it('Three definition types', async () => {
    const run = (await readJson<RunFile>(all, PATHS.runFile(await runIdOf(all, '2026-11-07'))))!;
    const index = (await readJson<RunsIndex>(all, PATHS.runsIndex))!;
    const row = index.runs.find((r) => r.id === run.id)!;
    const track = resample(run.samples.lat, run.samples.lon, run.samples.t);
    const seg = detectRouteSegments([{ runId: run.id, pts: track }, ...[]]);
    expect(seg).toEqual([]); // one run alone shares no route
    const base = { origin: 'manual' as const, status: 'active' as const, createdAt: '' };
    const route: BlockDefinition = { ...base, id: 'r', name: 'route', params: { type: 'route', track: track.slice(200, 310).map(({ lat, lon, heading }) => ({ lat, lon, heading })), length: 1090, heading: 45 }, tolerances: DEFAULT_TOLERANCES };
    const structure: BlockDefinition = { ...base, id: 's', name: '17 km lap', params: { type: 'structure', kind: 'distance', target: 17000, tolerance: 0.03 }, tolerances: DEFAULT_TOLERANCES };
    const steady: BlockDefinition = { ...base, id: 'f', name: 'steady', params: { type: 'steady', minDuration: 240 }, tolerances: { ...DEFAULT_TOLERANCES, paceMin: 285, paceMax: 315 } };
    expect(detectInstances(route, run, row, track).length).toBeGreaterThan(0);
    expect(detectInstances(steady, run, row, track).length).toBeGreaterThan(0);
    expect(detectInstances(structure, run, row, track)).toHaveLength(1); // the run's 17 km lap
  });
});

describe('Blocks without GPS', () => {
  it('Treadmill tempo detected', async () => {
    const folder = await makeDataFolder([TEMPO_25[4]]);
    await importFolder(folder);
    const run = (await readJson<RunFile>(folder, PATHS.runFile('20261109-190552')))!;
    run.samples.lat = run.samples.lat.map(() => null);
    run.samples.lon = run.samples.lon.map(() => null);
    const row = (await readJson<RunsIndex>(folder, PATHS.runsIndex))!.runs[0];
    const def: BlockDefinition = { id: 't', name: '25-minute lap', origin: 'manual', status: 'active', createdAt: '', params: { type: 'structure', kind: 'time', target: 1500, tolerance: 0.03 }, tolerances: DEFAULT_TOLERANCES };
    const found = detectInstances(def, run, row, resample(run.samples.lat, run.samples.lon, run.samples.t));
    expect(found).toHaveLength(1);
    expect(found[0].duration).toBe(1500);
  });
});

describe('Recommendations found unaided', () => {
  it('Both acceptance blocks proposed', async () => {
    const r = await recs(all);
    expect(r.some(isPromenade)).toBe(true);
    // The tempo laps since 3 Aug: only 26 Sep and 9 Nov, fewer than 3 workouts; the full year has 5.
    const year = await makeDataFolder(ALL);
    await importFolder(year);
    expect((await recs(year)).some(isTempo)).toBe(true);
  });
});
