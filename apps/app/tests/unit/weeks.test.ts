import { describe, expect, it } from 'vitest';
import { addDays, isoWeek, localDay, mondayOf, monthsOf, weeksOf } from '@/lib/log';
import type { IndexedRun } from '@/lib/kernel';

/** A run at 7:00 local time on a day. */
const run = (day: string, km: number, minutes: number, hr: number | null = null): IndexedRun => ({
  id: day, startTime: new Date(`${day}T07:00:00`).toISOString(), file: `${day}.fit`, device: 'COROS PACE 4',
  distance: km * 1000, duration: minutes * 60, avgSpeed: (km * 1000) / (minutes * 60), avgHeartRate: hr,
  temperature: null, hasGps: true, laps: 1, metrics: ['speed', 'heartRate'], algorithmVersion: 1,
});

describe('Calendar of runs by week', () => {
  it('Runs grouped into weeks', () => {
    const runs = [run('2026-11-02', 10, 50, 150), run('2026-11-04', 5, 30, 140), run('2026-10-18', 8, 40)];
    const weeks = weeksOf(runs, '2026-11-05');
    expect(weeks.map((w) => w.start)).toEqual(['2026-11-02', '2026-10-26', '2026-10-19', '2026-10-12']);
    const [now] = weeks;
    expect(now).toMatchObject({ count: 2, distance: 15000, duration: 4800, current: true });
    // The average pace: 80 min over 15 km, 5:20 /km; the heart rate weighted by time.
    expect(now.duration / (now.distance / 1000)).toBe(320);
    expect(now.heartRate).toBeCloseTo((150 * 50 + 140 * 30) / 80);
    expect(now.days.map((d) => d.runs.length)).toEqual([1, 0, 1, 0, 0, 0, 0]);
    expect(weeks[1]).toMatchObject({ count: 0, distance: 0, heartRate: null, current: false });
    expect(weeks[3].days[6]).toMatchObject({ date: '2026-10-18' });
    expect(weeks[3].days[6].runs).toHaveLength(1);
    // Grouped by the month of their Thursday: the week of 26 October (Thursday 29) stays in October;
    // a month's totals are its runs'.
    expect(isoWeek('2026-11-02')).toBe(45);
    expect(isoWeek('2026-12-28')).toBe(53);
    expect(isoWeek('2027-01-04')).toBe(1);
    const months = monthsOf(weeks);
    expect(months.map((m) => [m.month, m.weeks.map((w) => w.start)])).toEqual([['2026-11', ['2026-11-02']], ['2026-10', ['2026-10-26', '2026-10-19', '2026-10-12']]]);
    expect(months.map((m) => [m.count, m.distance])).toEqual([[2, 15000], [1, 8000]]);
    // A week whose Thursday is in the next month goes there, its earlier days' runs counted in theirs.
    const across = monthsOf(weeksOf([run('2026-09-28', 6, 30), run('2026-10-02', 4, 20)], '2026-10-02'));
    expect(across.map((m) => [m.month, m.weeks.length, m.count])).toEqual([['2026-10', 1, 1]]);
    // A later today brings its own (empty) weeks ahead; no runs, no weeks.
    expect(weeksOf(runs, '2026-11-20')[0]).toMatchObject({ start: '2026-11-16', count: 0, current: true });
    expect(weeksOf([], '2026-11-05')).toEqual([]);
    // Days: the local day, the Monday of a Sunday, across the end of a month and of a year.
    expect(localDay(new Date('2026-11-04T07:00:00').toISOString())).toBe('2026-11-04');
    expect(mondayOf('2026-10-18')).toBe('2026-10-12');
    expect(mondayOf('2026-11-02')).toBe('2026-11-02');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
  });
});
