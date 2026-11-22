import { describe, expect, it } from 'vitest';
import { similarOf } from '@/lib/detection';
import { PATHS, readJson } from '@/lib/fs';
import type { RunsIndex } from '@/lib/kernel';
import { importFolder } from '@/lib/pipeline';
import { fitFixtures, makeDataFolder } from '../support/fixtures';

/** Eight runs of late October 2026: some over the same streets, others elsewhere. */
const FILES = (await fitFixtures()).sort().filter((f) => f >= '2026-10-17').slice(0, 8);

describe('Similar stretches in the data folder', () => {
  it('Same route and same profile found in the other runs', async () => {
    const folder = await makeDataFolder(FILES);
    await importFolder(folder);
    const runs = (await readJson<RunsIndex>(folder, PATHS.runsIndex))!.runs;
    const own = runs.find((r) => r.hasGps && r.distance > 5000)!;
    const steps: number[] = [];
    // A fifth of the run, from 30 % of it.
    const r = await similarOf(folder, { runId: own.id, from: own.duration * 0.3, to: own.duration * 0.5 }, (p) => steps.push(p.done));
    expect(r.why).toBeNull();
    expect(steps).toHaveLength(runs.length - 1);
    expect(r.reference!.distance).toBeGreaterThan(400);
    expect(r.track.length).toBeGreaterThan(30);
    expect([...r.route, ...r.profile].every((s) => s.runId !== own.id)).toBe(true);
    // Newest first over the same route; most alike first, from 60 %, on the others.
    expect(r.route.map((s) => s.runStart)).toEqual([...r.route.map((s) => s.runStart)].sort().reverse());
    expect(r.profile.every((s) => s.score! >= 0.6)).toBe(true);
    expect(r.profile.map((s) => s.score)).toEqual([...r.profile.map((s) => s.score)].sort((a, b) => b! - a!));
    expect(r.route.length + r.profile.length).toBeGreaterThan(0);
    // A stretch too short to compare, and a run not in the folder.
    expect((await similarOf(folder, { runId: own.id, from: 600, to: 630 })).why).toMatch(/^Select at least 400 m/);
    expect((await similarOf(folder, { runId: 'none', from: 0, to: 600 })).why).toBe('The run is not in the data folder.');
  }, 120_000);
});
