import { afterEach, describe, expect, it } from 'vitest';
import { SAVED_WORDS, SHOWN_WORDS, routeName } from '@/lib/blocks';
import { distance, km, pace } from '@/lib/format';
import { distanceText, elevationText, fromPace, paceUnit, setUnits, toPace, units } from '@/lib/i18n';
import { formatBoundaries, parseBoundaries } from '@/lib/settings';

/**
 * The units chosen (requirement "Units chosen": "dodaj obsluge innych jednostek mam na mysli mile"):
 * what is shown and typed is in km, min/km and m or in mi, min/mi and ft; the data keep metres and s/km.
 */
describe('Units chosen', () => {
  afterEach(() => setUnits('metric'));

  it('shows metric at first', () => {
    expect(units()).toBe('metric');
    expect(distanceText(5240)).toBe('5.24 km');
    expect(pace(1000 / 300)).toBe('5:00');
    expect(paceUnit()).toBe('/km');
  });

  it('shows distance, pace and elevation in miles and feet', () => {
    setUnits('imperial');
    expect(distance(1609.344)).toBe('1.00 mi');
    expect(km(10000)).toBe('6.21');
    // 5:00 /km is 8:03 /mi.
    expect(pace(1000 / 300)).toBe('8:03');
    expect(paceUnit()).toBe('/mi');
    expect(elevationText(100)).toBe('328 ft');
  });

  it('reads a pace typed per mile back as s/km', () => {
    setUnits('imperial');
    expect(toPace(fromPace(480))).toBeCloseTo(480, 9);
    const zones = parseBoundaries('speed', '9:00, 8:00')!;
    expect(zones[0]).toBeCloseTo(540 / 1.609344, 6);
    expect(formatBoundaries('speed', zones)).toBe('9:00, 8:00');
  });

  it('keeps the names the app saves in km, and shows them in miles', () => {
    setUnits('imperial');
    expect(routeName(8046.72, 0, SAVED_WORDS)).toBe('8.0 km north-bound');
    expect(routeName(8046.72, 0, SHOWN_WORDS)).toBe('5.0 mi north-bound');
  });
});
