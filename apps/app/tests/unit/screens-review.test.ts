import { beforeAll, describe, expect, it } from 'vitest';
import { niceTicks } from '@/components/chartKit';
import { duration } from '@/lib/format';
import { BrowserFolder } from '@/lib/fs';
import { readRunTags, saveRunTag, writeRunTags } from '@/lib/gear';
import { number, signOf } from '@/lib/i18n';
import { minSec } from '@/lib/kernel';
import { formatBoundaries, parseBoundaries } from '@/lib/settings';
import { MemDir, dirHandle } from '../support/memFolder';

// The first use of a number format is no part of a test's time.
beforeAll(() => { number(1.5, 1); });

/** The review of the screens (26 Nov 2026, the runner's "zmergowane, zrob kolejna iteracje"). */
describe('Screens reviewed', () => {
  it('A time rounded before it is split', () => {
    // A lap of 299.87 s is 5:00 (split first, it read 4:60); an hour less four tenths is an hour.
    expect([duration(299.87), duration(3599.6), duration(59.4), duration(7325)]).toEqual(['5:00', '1:00:00', '0:59', '2:02:05']);
    expect([minSec(299.6), minSec(239.4), minSec(59.5)]).toEqual(['5:00', '3:59', '1:00']);
  });

  it('A number that writes as zero has no minus', () => {
    expect([number(-0.04, 1), number(-0), number(-0.004, 2), number(-0.06, 1)]).toEqual(['0.0', '0', '0.00', '-0.1']);
    expect([signOf(-0.04, 1), signOf(-0.06, 1), signOf(0.2), signOf(-0.4)]).toEqual(['+', '−', '+', '+']);
    // The first tick of an axis from just under zero is 0, not −0.
    expect(Object.is(niceTicks(-24, 100, 4)[0], 0)).toBe(true);
  });

  it('A comma as the decimal sign of a zone boundary', () => {
    // As a Polish runner types them: between semicolons, or apart by spaces (they were saved as 5, 9, 10, 11).
    expect(parseBoundaries('efficiency', '9,5; 10,5; 11,5')).toEqual([9.5, 10.5, 11.5]);
    expect(parseBoundaries('efficiency', '9,5 10,5')).toEqual([9.5, 10.5]);
    expect(parseBoundaries('efficiency', '9.5; 10.5')).toEqual([9.5, 10.5]);
    // Between whole numbers a comma separates, as before.
    expect(parseBoundaries('heartRate', '114, 133,152')).toEqual([114, 133, 152]);
    expect(parseBoundaries('heartRate', '114,133')).toEqual([114, 133]);
    expect(parseBoundaries('speed', '5:30, 5:00; 4:30')).toEqual([330, 300, 270]);
    // Shown the way they are read back: boundaries with decimals between semicolons.
    expect(formatBoundaries('efficiency', [9.5, 10.5])).toBe('9.5; 10.5');
    expect(parseBoundaries('efficiency', formatBoundaries('efficiency', [9.5, 10.5]))).toEqual([9.5, 10.5]);
    expect(formatBoundaries('heartRate', [114, 133])).toBe('114, 133');
  });

  it('A run’s tags saved into the file as it is now', async () => {
    const folder = new BrowserFolder(dirHandle(new MemDir('runs')));
    // A screen read the tags; meanwhile another window noted run a.
    const read = await readRunTags(folder);
    await writeRunTags(folder, { ...read, tags: { a: { note: 'windy' } } });
    // The screen saves run b: both stay (it wrote its own copy back whole, and the note was gone).
    await saveRunTag(folder, 'b', { workoutType: 'long' });
    expect((await readRunTags(folder)).tags).toEqual({ a: { note: 'windy' }, b: { workoutType: 'long' } });
  });
});
