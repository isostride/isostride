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

describe('Assign gear by date', () => {
  it('Gear assigned by date', () => {
    const c = contextFor(row('2026-10-20T07:00:00'), [shoesA, armBand], noTags, {});
    expect(c.shoes).toBe('Shoes A');
    expect(c.heartRateSource).toBe('Arm band');
  });

  it('Range change reassigns runs', () => {
    const run = row('2026-10-13T07:00:00');
    expect(contextFor(run, [armBand], noTags, {}).heartRateSource).toBe('wrist (COROS PACE 4)');
    const moved = { ...armBand, from: '2026-10-12' };
    expect(contextFor(run, [moved], noTags, {}).heartRateSource).toBe('Arm band');
  });
});

describe('Per-run gear override', () => {
  it('Shoe override for one run', () => {
    const run = row('2026-09-10T07:00:00');
    const other = row('2026-09-12T07:00:00');
    const onlyA = [shoesA, { ...shoesB, from: '2026-11-01' }];
    const tags = { ...noTags, tags: { [run.id]: { shoesOverride: 'b' } } };
    expect(contextFor(run, onlyA, tags, {})).toMatchObject({ shoes: 'Shoes B', shoesOverridden: true });
    expect(contextFor(other, onlyA, tags, {})).toMatchObject({ shoes: 'Shoes A', shoesOverridden: false });
  });
});

describe('Compute day state', () => {
  it('Day state computed', () => {
    // A run on each of the 7 days before 14 Nov: 30, 40, 50, 60, 70, 80, 90 minutes (7 Nov … 13 Nov).
    const runs = [30, 40, 50, 60, 70, 80, 90].map((min, k) => ({
      startTime: `2026-11-${String(7 + k).padStart(2, '0')}T07:00:00`,
      duration: min * 60,
    }));
    const days = computeDayStates(runs, ['2026-11-14']);
    // Previous 3 days: 11, 12, 13 Nov = 70 + 80 + 90; previous 7 days: all = 420.
    expect(days['2026-11-14']).toEqual({ date: '2026-11-14', load3: 240, load7: 420 });
    // 7 Nov has no earlier runs.
    expect(days['2026-11-07']).toEqual({ date: '2026-11-07', load3: 0, load7: 0 });
  });
});
