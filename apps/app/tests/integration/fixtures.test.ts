import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, inject, it } from 'vitest';
import { PATHS, readJson } from '@/lib/fs';
import type { RunFile, RunsIndex } from '@/lib/kernel';
import { importFolder } from '@/lib/pipeline';
import { NodeFolder } from '../support/nodeFolder';

const pace = (mps: number) => { const s = Math.round(1000 / mps); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const mean = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null); return v.reduce((a, b) => a + b, 0) / v.length; };

describe('Versioned FIT fixtures', () => {
  it('Fixtures load fresh', async () => {
    // The global setup copied the fixtures into a fresh temporary data folder.
    const src = inject('fixturesFolder');
    const expected = inject('expected');
    expect(src.startsWith(os.tmpdir())).toBe(true);
    // Each test gets its own copy, so no test sees another's derived files.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fixtures-run-'));
    fs.cpSync(src, dir, { recursive: true });
    const folder = new NodeFolder(dir);
    const report = await importFolder(folder);

    for (const [file, e] of Object.entries(expected)) {
      const outcome = report.outcomes.find((o) => o.file.endsWith(file))!;
      if (e.error) {
        expect(outcome, file).toMatchObject({ status: 'error', reason: e.error });
        continue;
      }
      expect(outcome, file).toMatchObject({ status: 'imported', runId: e.runId });
      const run = (await readJson<RunFile>(folder, PATHS.runFile(e.runId as string)))!;
      expect(run).toMatchObject({ startTime: e.startTime, device: e.device, distance: e.distance, duration: e.duration, laps: e.laps });
      expect(run.samples.t).toHaveLength(e.samples as number);
      const lap = (e.laps as { start: number; duration: number }[]).reduce((a, b) => (b.duration > a.duration ? b : a));
      const inLap = (s: (number | null)[]) => s.filter((_, i) => run.samples.t[i] >= lap.start && run.samples.t[i] < lap.start + lap.duration);
      expect(pace(mean(inLap(run.samples.values.speed ?? []))), file).toBe(e.pace);
      expect(mean(inLap(run.samples.values.heartRate ?? []))).toBe(e.heartRate);
      expect(mean(inLap(run.samples.values.cadence ?? []))).toBe(e.cadence);
      expect(mean(inLap(run.samples.values.groundContactTime ?? []))).toBe(e.groundContactTime);
      expect(mean(inLap(run.samples.values.effortPace ?? []))).toBeCloseTo(e.effortPace as number, 3);
      expect(mean(inLap(run.samples.values.legSpringStiffness ?? []))).toBe(e.legSpringStiffness);
    }
    const index = (await readJson<RunsIndex>(folder, PATHS.runsIndex))!;
    expect(index.runs.map((r) => r.id)).toEqual(['20260601-070000', '20260603-070000']);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
