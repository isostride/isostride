import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PATHS, readJson, writeJson } from '@/lib/fs';
import { DEFAULT_ZONES, formatBoundaries, parseBoundaries, readSettings, writeSettings, zoneOf, zoneRanges, zonesFromMaxHr } from '@/lib/settings';
import { NodeFolder } from '../support/nodeFolder';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zones-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('Metric zones in settings', () => {
  it('Zone of a value', async () => {
    // Heart rate boundaries typed in any order are sorted; a value on a boundary is in the zone above.
    const hr = parseBoundaries('heartRate', '171, 114 152;133')!;
    expect(hr).toEqual([114, 133, 152, 171]);
    expect(zoneOf('heartRate', hr, 140)).toBe(2);
    expect(zoneOf('heartRate', hr, 100)).toBe(0);
    expect(zoneOf('heartRate', hr, 180)).toBe(4);
    expect(zoneOf('heartRate', hr, 133)).toBe(2);
    expect(zoneRanges('heartRate', hr)).toEqual([{ lo: null, hi: 114 }, { lo: 114, hi: 133 }, { lo: 133, hi: 152 }, { lo: 152, hi: 171 }, { lo: 171, hi: null }]);
    // Pace as m:ss per km, from the slowest: Z1 is the slowest zone.
    const pace = parseBoundaries('speed', '5:30, 4:30, 5:00')!;
    expect(pace).toEqual([330, 300, 270]);
    expect(formatBoundaries('speed', pace)).toBe('5:30, 5:00, 4:30');
    expect(zoneOf('speed', pace, 360)).toBe(0);
    expect(zoneOf('speed', pace, 260)).toBe(3);
    expect(zoneRanges('speed', pace)[0]).toEqual({ lo: 330, hi: null });
    expect(zoneRanges('speed', pace)[3]).toEqual({ lo: null, hi: 270 });
    // What does not read is refused; an empty field clears the zones.
    expect(parseBoundaries('speed', '5:30, fast')).toBeNull();
    expect(parseBoundaries('heartRate', '150 -3')).toBeNull();
    expect(parseBoundaries('heartRate', '  ')).toEqual([]);
    expect(parseBoundaries('efficiency', '1.2 1.4')).toEqual([1.2, 1.4]);
    // From the maximum heart rate: 60, 70, 80 and 90 % of it.
    expect(zonesFromMaxHr(190)).toEqual([114, 133, 152, 171]);

    // With no settings saved, the default zones apply: heart rate, pace (6:00 … 4:15) and cadence.
    const folder = new NodeFolder(path.join(dir, 'f'));
    expect(await readSettings(folder)).toEqual({ schemaVersion: 1, zones: DEFAULT_ZONES, defaults: true });
    expect(formatBoundaries('speed', DEFAULT_ZONES.speed)).toBe('6:00, 5:15, 4:45, 4:15');
    expect(DEFAULT_ZONES.heartRate).toEqual(zonesFromMaxHr(190));
    // Kept in user/settings.json; metrics with no zones are left out; saved, only what was entered applies.
    await writeSettings(folder, { schemaVersion: 1, zones: { heartRate: [171, 114, 152, 133], cadence: [] }, defaults: true });
    expect(await readJson(folder, PATHS.settings)).toEqual({ schemaVersion: 1, zones: { heartRate: [114, 133, 152, 171] } });
    expect(await readSettings(folder)).toEqual({ schemaVersion: 1, zones: { heartRate: [114, 133, 152, 171] } });
    await writeJson(folder, PATHS.settings, { zones: { speed: [270, 'x', 330], power: 'none' } });
    expect((await readSettings(folder)).zones).toEqual({ speed: [330, 270] });
  });
});
