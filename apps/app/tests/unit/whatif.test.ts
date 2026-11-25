import { describe, expect, it } from 'vitest';
import { curveWhatIf, effortsParam, loadWhatIf, parseClock, parseEfforts, parseWeeks, weeksParam } from '@/lib/load';

/** Bests of 30 s to 20 minutes on a power law: speed 4.5 m/s at 2 minutes, falling by 6 % a doubling. */
const BESTS = [30, 60, 120, 180, 300, 600, 900, 1200].map((duration) => ({ duration, speed: 4.5 * Math.pow(duration / 120, -0.09) }));
const at = (list: { duration: number; speed: number }[], d: number) => list.find((b) => b.duration === d)!.speed;

describe('What if', () => {
  it('Curve with an effort that did not happen', () => {
    const now20 = at(BESTS, 1200);
    // 20 minutes 3 % faster than the best of 20 minutes: it raises the 20-minute best and every shorter one slower than it.
    const faster = { seconds: 1200, metres: now20 * 1.03 * 1200 };
    const r = curveWhatIf(BESTS, [faster]);
    expect(at(r.then.bests, 1200)).toBeCloseTo(now20 * 1.03, 6);
    expect(at(r.then.bests, 900)).toBeCloseTo(Math.max(at(BESTS, 900), now20 * 1.03), 6);
    expect(at(r.then.bests, 120)).toBe(at(BESTS, 120));
    expect(r.efforts[0].raises).toBe(true);
    // Critical speed rises, the predicted times fall, VDOT rises.
    expect(r.then.estimate!.critical!.rate).toBeGreaterThan(r.now.estimate!.critical!.rate);
    const p10 = (s: typeof r.now) => s.estimate!.predictions.find((p) => p.distance === 10000)!.seconds;
    expect(p10(r.then)).toBeLessThan(p10(r.now));
    expect(r.then.vdot!).toBeGreaterThan(r.now.vdot!);
    // The models now are those of the bests as they are.
    expect(r.now.bests).toEqual(BESTS);

    // The best itself, kept in the link to a tenth of a metre, changes nothing either way of the rounding.
    for (const metres of [Math.floor(now20 * 12000) / 10, Math.ceil(now20 * 12000) / 10]) {
      const same = curveWhatIf(BESTS, [{ seconds: 1200, metres }], new Map(BESTS.map((b) => [b.duration, b.speed])));
      expect(same.efforts[0]).toMatchObject({ raises: false, beyond: false });
      expect(same.then.estimate).toEqual(same.now.estimate);
    }
    // A slower effort changes nothing.
    const slower = curveWhatIf(BESTS, [{ seconds: 1200, metres: now20 * 0.9 * 1200 }]);
    expect(slower.efforts[0].raises).toBe(false);
    expect(slower.then.bests).toEqual(slower.now.bests);

    // A length between those of the curve (17 minutes) counts as the one under it, as the import would count it.
    const odd = curveWhatIf(BESTS, [{ seconds: 1020, metres: 5000 }]);
    expect(odd.efforts[0].counts).toBe(900);
    expect(odd.then.bests.map((b) => b.duration)).toEqual([30, 60, 120, 180, 300, 600, 900, 1200]);
    expect(at(odd.then.bests, 900)).toBeCloseTo(5000 / 1020, 6);
    expect(at(odd.then.bests, 1200)).toBe(at(BESTS, 1200));
    // 25 minutes counts as the best of 20; 30 minutes as one of its own, a length of the curve.
    expect(curveWhatIf(BESTS, [{ seconds: 1500, metres: 6000 }]).efforts[0].counts).toBe(1200);
    expect(curveWhatIf(BESTS, [{ seconds: 1800, metres: 7000 }]).efforts[0].counts).toBe(1800);

    // Beyond every best of the runner, and what the predicted times leave out.
    const ever = new Map(BESTS.map((b) => [b.duration, b.speed]));
    expect(curveWhatIf(BESTS, [faster], ever).efforts[0].beyond).toBe(true);
    expect(curveWhatIf(BESTS, [{ seconds: 1200, metres: now20 * 0.99 * 1200 }], ever).efforts[0].beyond).toBe(false);
    expect(curveWhatIf(BESTS, [{ seconds: 150, metres: 700 }]).efforts[0]).toMatchObject({ counts: 120, short: true });
    expect(curveWhatIf(BESTS, [{ seconds: 20, metres: 150 }]).efforts[0]).toMatchObject({ counts: null, raises: false });
    // Critical speed and the predicted times keep the bests of 2–20 minutes: a faster sprint of 60 s leaves them as they are.
    const sprint = curveWhatIf(BESTS, [{ seconds: 60, metres: at(BESTS, 60) * 1.2 * 60 }]);
    expect(sprint.efforts[0].raises).toBe(true);
    expect(sprint.then.estimate).toEqual(sprint.now.estimate);
    expect(curveWhatIf(BESTS, [faster]).efforts[0].short).toBe(false);
  });

  it('Scenario kept in the link', () => {
    expect(parseClock('20:00')).toBe(1200);
    expect(parseClock('1:02:03')).toBe(3723);
    expect(parseClock('17')).toBe(1020);
    expect(parseClock('3:75')).toBeNull();
    expect(parseClock('abc')).toBeNull();
    const efforts = [{ seconds: 1200, metres: 5217.39 }, { seconds: 600, metres: 2800 }];
    expect(effortsParam(efforts)).toBe('1200-5217.4,600-2800');
    expect(parseEfforts(effortsParam(efforts))).toEqual([{ seconds: 1200, metres: 5217.4 }, { seconds: 600, metres: 2800 }]);
    expect(parseEfforts('x,0-5,1200-5000')).toEqual([{ seconds: 1200, metres: 5000 }]);
    expect(parseWeeks(weeksParam([110, 110.4, 70]))).toEqual([110, 110, 70]);
    expect(parseWeeks('100,-5,abc,400,80')).toEqual([100, 80]);
  });

  it('Form with weeks of load that did not happen', () => {
    // Eight weeks of a run every Tuesday (60), Thursday (80) and Sunday (100) up to Sunday 22 Nov 2026.
    const runs: { startTime: string; load: number }[] = [];
    for (let w = 0; w < 8; w++) {
      for (const [k, load] of [[1, 60], [3, 80], [6, 100]] as const) {
        const d = new Date('2026-09-28T12:00:00');
        d.setDate(d.getDate() + w * 7 + k);
        runs.push({ startTime: d.toISOString(), load });
      }
    }
    const p = { fitnessDays: 42, fatigueDays: 7 };
    const today = '2026-11-22';
    // The pattern is the runner's week: Tuesday 60, Thursday 80, Sunday 100.
    const same = loadWhatIf(runs, p, today, [100, 100]);
    expect(same.pattern).toEqual([0, 60, 0, 80, 0, 0, 100]);
    expect(same.recentWeek).toBe(240);
    expect(same.from).toBe('2026-11-23');
    expect(same.until).toBe('2026-12-06');
    expect(same.weeks.map((w) => w.load)).toEqual([240, 240]);
    expect(same.planned).toHaveLength(6);
    expect(same.heaviest).toBe(240);
    expect(same.weeks.some((w) => w.beyond)).toBe(false);
    expect(same.days[same.days.length - 1].date).toBe('2026-12-06');

    // A harder block then a week of rest: fitness rises over the hard weeks, form falls, then the rest brings form up.
    const block = loadWhatIf(runs, p, today, [130, 130, 40]);
    expect(block.weeks[0].load).toBe(312);
    expect(block.weeks[0].beyond).toBe(true);
    expect(block.weeks[1].fitness).toBeGreaterThan(same.weeks[1].fitness);
    expect(block.weeks[1].form).toBeLessThan(same.weeks[1].form);
    expect(block.weeks[2].form).toBeGreaterThan(block.weeks[1].form);
    expect(block.weeks[0].ramp).toBeGreaterThan(0);

    // A history shorter than the weeks of the pattern: its one week is the week, not a quarter of it.
    const short = loadWhatIf(runs.slice(-3), p, today, [100]);
    expect(short.pattern).toEqual([0, 60, 0, 80, 0, 0, 100]);
    expect(short.weeks[0].load).toBe(240);

    // No week: the past as it is.
    const none = loadWhatIf(runs, p, today, []);
    expect(none.weeks).toEqual([]);
    expect(none.days[none.days.length - 1].date).toBe(today);
  });
});
