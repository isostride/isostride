import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DEMO_VERSION, dayNumber, demoPlan, type DemoFile } from '@/lib/demo';
import { runBlocks } from '@/lib/detection';
import { PATHS, listFitFiles, readJson, readManifest, writeJson, writeManifest } from '@/lib/fs';
import { readRunTags } from '@/lib/gear';
import { parseFit } from '@/lib/ingest';
import type { RunsIndex } from '@/lib/kernel';
import { criticalSeries, type LoadSummary } from '@/lib/load';
import { DEMO_RECENT_WEEKS, recentFrom, seedDemo } from '@/lib/pipeline';
import { readSetup } from '@/lib/settings';
import { NodeFolder } from '../support/nodeFolder';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
const NOW = new Date(2026, 10, 26, 19, 0, 0);

describe('Demo folder', () => {
  it('Demo folder is made in parts and opened again', async () => {
    const folder = new NodeFolder(dir);
    const plan = demoPlan(dayNumber(NOW), NOW, 'en');
    // The last months first: what the app opens on, from the runner's last test of the critical speed before them.
    const from = recentFrom(plan, dayNumber(NOW));
    expect(plan.find((r) => r.day === from)!.kind).toBe('test');
    expect(dayNumber(NOW) - from).toBeGreaterThanOrEqual(DEMO_RECENT_WEEKS * 7);
    expect(dayNumber(NOW) - from).toBeLessThan((DEMO_RECENT_WEEKS + 16) * 7);
    const recent = await seedDemo(folder, { part: 'recent', lang: 'en', now: NOW });
    expect(recent.total).toBe(plan.length);
    expect(recent.imported).toBe(plan.filter((r) => r.day >= from).length);
    // Its first run is that test: the critical speed is the runner's from the first day shown.
    expect(recent.remaining).toBe(plan.length - recent.imported);
    // A folder like any other: FIT files a watch could have written, imported, joined with their context, the segments found.
    const index = (await readJson<RunsIndex>(folder, PATHS.runsIndex))!;
    expect(index.runs).toHaveLength(recent.imported);
    const manifest = (await readManifest(folder))!;
    expect(Object.values(manifest.files).every((f) => f.status === 'imported')).toBe(true);
    expect(manifest.joined).not.toBe(false);
    const fit = await listFitFiles(folder);
    expect(fit).toHaveLength(recent.imported);
    const last = index.runs[index.runs.length - 1];
    expect(parseFit(await folder.readBytes(last.file)).startTime).toBe(last.startTime);
    expect(index.runs.every((r) => r.workoutType && r.shoes && typeof r.load === 'number')).toBe(true);
    expect((await readJson<{ instances: { definitionId: string }[] }>(folder, PATHS.blockInstances))!.instances.some((i) => i.definitionId === 'b-demo-1km')).toBe(true);
    // Its segments each have an id of their own; a list kept from an earlier version of the app, where two from one
    // start shared one, is found again.
    interface Segments { algorithmVersion: number; runs: string; segments: { id: string }[] }
    const found = (await readJson<Segments>(folder, PATHS.segments))!;
    expect(found.segments.length).toBeGreaterThan(1);
    expect(new Set(found.segments.map((s) => s.id)).size).toBe(found.segments.length);
    await writeJson(folder, PATHS.segments, { ...found, segments: found.segments.map((s, k) => (k === 1 ? { ...s, id: found.segments[0].id } : s)) });
    await runBlocks(folder);
    expect((await readJson<Segments>(folder, PATHS.segments))!.segments.map((s) => s.id)).toEqual(found.segments.map((s) => s.id));
    // What the runner would have entered is there, the set-up done: the wizard does not open.
    expect((await readSetup(folder))?.state).toBe('done');
    expect(Object.keys((await readRunTags(folder)).tags)).toHaveLength(recent.imported);
    expect(await readJson<DemoFile>(folder, PATHS.demo)).toMatchObject({ version: DEMO_VERSION, anchor: dayNumber(NOW), lang: 'en' });
    // The app's own fit to the bests of the last 90 days: a critical pace of about 3:15 /km.
    const sums = (await readJson<{ runs: Record<string, LoadSummary> }>(folder, PATHS.loadSummaries))!.runs;
    const critical = criticalSeries(index.runs, sums, 'speed')[last.id]!;
    expect(1000 / critical.rate).toBeGreaterThan(190);
    expect(1000 / critical.rate).toBeLessThan(200);
    expect(critical.reserve).toBeGreaterThan(100);
    expect(critical.reserve).toBeLessThan(300);

    // The earlier history, a part at a call, newest first; its segments are found once, at its end. A file whose
    // writing was cut off (the tab closed meanwhile) is left empty: its run is made again, not read as an error.
    const cut = plan.filter((r) => r.day < from).pop()!;
    await folder.writeBytes(cut.file, new Uint8Array(0));
    const more = await seedDemo(folder, { part: 'more', lang: 'en', now: NOW });
    expect(Object.values((await readManifest(folder))!.files).filter((f) => f.status !== 'imported')).toEqual([]);
    expect((await readJson<RunsIndex>(folder, PATHS.runsIndex))!.runs.some((r) => r.file === cut.file)).toBe(true);
    expect(more.imported).toBeGreaterThan(0);
    expect(more.remaining).toBe(recent.remaining - more.imported);
    const after = (await readJson<RunsIndex>(folder, PATHS.runsIndex))!;
    expect(after.runs).toHaveLength(recent.imported + more.imported);
    expect(after.runs[0].startTime < index.runs[0].startTime).toBe(true);
    expect(after.runs.every((r) => r.workoutType)).toBe(true);
    expect(await readJson<DemoFile>(folder, PATHS.demo)).toMatchObject({ segmentsPending: true });

    // Opened again the same evening: the last months are there, nothing is made or written.
    const stamp = await folder.readText(PATHS.dataStamp);
    const again = await seedDemo(folder, { part: 'recent', lang: 'pl', now: NOW });
    expect(again).toEqual({ imported: 0, remaining: more.remaining, total: plan.length });
    expect(await folder.readText(PATHS.dataStamp)).toBe(stamp);
    // Cut off after a part's runs were imported and before its end (the context joined, the segments found): the
    // next opening ends it, though no run is missing.
    await writeManifest(folder, { ...(await readManifest(folder))!, joined: false });
    await folder.remove(PATHS.loadSummaries);
    await seedDemo(folder, { part: 'recent', lang: 'en', now: NOW });
    expect((await readManifest(folder))!.joined).toBe(true);
    expect(await readJson(folder, PATHS.loadSummaries)).not.toBeNull();
    // Opened three days later: the runs of the days since are added, the folder keeps its language.
    const later = new Date(NOW.getTime() + 3 * 86_400_000);
    const topUp = await seedDemo(folder, { part: 'recent', lang: 'pl', now: later });
    expect(topUp.imported).toBe(demoPlan(dayNumber(NOW), later, 'en').length - plan.length);
    expect(topUp.imported).toBeGreaterThan(0);
    expect((await readJson<DemoFile>(folder, PATHS.demo))!.lang).toBe('en');

    // Opened ten weeks later: a demo that old is made again, ending that day.
    const muchLater = new Date(NOW.getTime() + 70 * 86_400_000);
    const fresh = await seedDemo(folder, { part: 'recent', lang: 'pl', now: muchLater });
    expect((await readJson<DemoFile>(folder, PATHS.demo))!).toMatchObject({ anchor: dayNumber(muchLater), lang: 'pl' });
    expect((await readJson<RunsIndex>(folder, PATHS.runsIndex))!.runs).toHaveLength(fresh.imported);
  });
});
