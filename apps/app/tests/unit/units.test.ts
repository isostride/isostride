import { afterEach, describe, expect, it } from 'vitest';
import { EMPTY_CONDITIONS, SAVED_WORDS, SHOWN_WORDS, effortName, profileSegmentName, routeName, ruleName, ruleOf, shapeName, type ProfileKey } from '@/lib/blocks';
import { distance, km, pace } from '@/lib/format';
import { distanceText, elevationText, elevationUnit, fromElevation, fromPace, isUnits, onLocale, paceUnit, setUnits, shownKey, toElevation, toPace, units } from '@/lib/i18n';
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

  it('is a setting of its own: checked, keyed with the language, its change told to the screens', () => {
    expect(isUnits('imperial')).toBe(true);
    expect(isUnits('miles')).toBe(false);
    expect(shownKey()).toBe('en metric');
    let told = 0;
    const off = onLocale(() => { told++; });
    setUnits('metric');
    expect(told).toBe(0);
    setUnits('imperial');
    expect(told).toBe(1);
    expect(shownKey()).toBe('en imperial');
    off();
  });

  it('keeps an elevation in metres in metric, in feet in imperial', () => {
    expect([toElevation(100), fromElevation(100), elevationUnit(), elevationText(120)]).toEqual([100, 100, 'm', '120 m']);
    setUnits('imperial');
    expect(fromElevation(toElevation(100))).toBeCloseTo(100, 9);
    expect(elevationUnit()).toBe('ft');
  });

  const climb: ProfileKey = { distance: 3000, altitude: [0, 10, 5, 20], shape: [1, 1, 1], pace: 290 } as ProfileKey;
  const flat: ProfileKey = { ...climb, altitude: null };

  it('names a profile in km as saved, in miles and feet as shown', () => {
    setUnits('imperial');
    expect(profileSegmentName(climb, SAVED_WORDS)).toBe('Like 3.0 km, 25 m up, pace 4:50');
    expect(profileSegmentName(flat, SAVED_WORDS)).toBe('Like 3.0 km, pace 4:50');
    expect(profileSegmentName(climb, SHOWN_WORDS)).toBe('Like 1.9 mi, 82 ft up, pace 7:47');
    expect(shapeName({ type: 'profile', key: climb, minScore: 0.8 }, SAVED_WORDS)).toBe('Same profile: 3.0 km, 25 m up, pace shape of 4:50');
    expect(shapeName({ type: 'profile', key: flat, minScore: 0.8 }, SHOWN_WORDS)).toBe('Same profile: 1.9 mi, pace shape of 7:47');
    expect(effortName('distance', 1609.344, SHOWN_WORDS)).toBe('1 mi effort');
    expect(effortName('distance', 5000, SAVED_WORDS)).toBe('5 km effort');
  });

  it('words the conditions of a rule in the units: pace, a pace metric, another metric, pace always', () => {
    const rule = (c: Partial<typeof EMPTY_CONDITIONS>) => ({ ...ruleOf({ type: 'run' }), conditions: { ...EMPTY_CONDITIONS, ...c } });
    const paced = rule({ distanceMin: 5000, paceMin: 300, paceMax: 330, alwaysPaceMax: 330, metric: 'speed', metricMin: 300, metricMax: 330 });
    const hr = rule({ metric: 'heartRate', metricMin: 150, metricMax: null });
    expect(ruleName(paced, SAVED_WORDS)).toBe('Runs · from 5 km · 5:00–5:30 /km · Pace 5:00–5:30 /km · pace always to 5:30 /km');
    expect(ruleName(hr, SAVED_WORDS)).toBe('Runs · Heart rate from 150 bpm');
    setUnits('imperial');
    expect(ruleName(paced, SHOWN_WORDS)).toBe('Runs · from 3.11 mi · 8:03–8:51 /mi · Pace 8:03–8:51 /mi · pace always to 8:51 /mi');
  });
});
