import { describe, expect, it } from 'vitest';
import { CURVE_DURATIONS, PT_ANAEROBIC, PT_RIEGEL_DECLINE, PT_TMAP, bestsWithin, fitWholeCurve, ptRate, wholePredictions, type WholeCurve } from '@/lib/curve';
import { edwardsTrimp, formSeries, hrVo2max, loadWhatIf, markersOverTime, summarizeLoad, weeklyLoad, type LoadSummary } from '@/lib/load';
import { syntheticRun } from '../support/synthetic';

/**
 * The faults the review of the models found (the runner's "upewnij sie ze sa popranie zimplementowane",
 * then "ok popraw wszystko pokolei", 25 Nov 2026), each with the behaviour that replaces it.
 */
describe('Performance models reviewed', () => {
  it('A best is a stretch of its whole length', () => {
    // 28 s at 6 m/s and 400 W in a run at 3 m/s and 200 W: the best of 30 s takes 2 s of the rest, not 28 s alone.
    const run = syntheticRun(600, (t) => (t >= 100 && t < 128 ? { speed: 6, power: 400 } : { speed: 3, power: 200 }));
    const [pace30] = bestsWithin(run, [[0, 1e9]], 'speed', [30]);
    expect(pace30.to - pace30.from).toBe(30);
    expect(pace30.value).toBeCloseTo((30 * 1000) / (28 * 6 + 2 * 3), 6);
    const [power30] = bestsWithin(run, [[0, 1e9]], 'power', [30]);
    expect(power30.to - power30.from).toBe(30);
    expect(power30.value).toBeCloseTo((28 * 400 + 2 * 200) / 30, 6);
    // A run of 600 samples holds no whole 10 minutes: its best is 1 s short, as before.
    const [ten] = bestsWithin(run, [[0, 1e9]], 'speed', [600]);
    expect(ten.to - ten.from).toBe(599);
  });

  it('Bests of pace from the effort pace, a downhill left out', () => {
    // Uphill 5 minutes: 3 m/s on the watch, 4 m/s of effort. The runs' bests (effort) see the effort; Analysis (raw) the speed.
    const hill = syntheticRun(1200, (t) => ({ speed: 3, effortPace: t >= 300 && t < 600 ? 4 : 3 }));
    expect(bestsWithin(hill, [[0, 1e9]], 'speed', [300], 'effort')[0].value).toBeCloseTo(250, 6);
    expect(bestsWithin(hill, [[0, 1e9]], 'speed', [300], 'raw')[0].value).toBeCloseTo(1000 / 3, 6);
    // No effort pace, 5 minutes downhill at 5 m/s (20 % down): the runs' bests leave out every stretch
    // descending more than 1 % of its length; Analysis keeps the raw downhill best.
    const down = syntheticRun(1200, (t) => (t >= 300 && t < 600 ? { speed: 5, altitude: 600 - t } : { speed: 3, altitude: t < 300 ? 300 : 0 }));
    delete down.samples.values.effortPace;
    expect(bestsWithin(down, [[0, 1e9]], 'speed', [300], 'raw')[0].value).toBeCloseTo(200, 6);
    expect(bestsWithin(down, [[0, 1e9]], 'speed', [300], 'effort')[0].value).toBeGreaterThan(1000 / 3.1);
  });

  it('Péronnet–Thibault: the decline from long bests only', () => {
    const truth = { mas: 5, s: 250, a: 0.3 };
    const bests = (longest: number, bump = 1) => CURVE_DURATIONS.filter((d) => d <= longest).map((duration) => ({ duration, value: 1000 / (ptRate(truth, duration) * (duration === longest ? bump : 1)) }));
    const truthTimes = wholePredictions({ model: 'pt', metric: 'speed', params: truth, range: [30, 7200], n: 13, error: 0, far: [], decline: true } satisfies WholeCurve);
    // The longest best 10 minutes, 2 % faster than the truth: the decline is Riegel's, the marathon within 3 %
    // (fitted from that one best, it came out 2:22 against 2:54, 18 % off).
    const short = fitWholeCurve(bests(600, 1.02), 'speed')!;
    expect(short.decline).toBe(false);
    expect(short.params.a).toBeCloseTo(PT_RIEGEL_DECLINE * short.params.mas, 9);
    const marathon = wholePredictions(short).find((p) => p.distance === 42195)!.seconds;
    expect(Math.abs(marathon / truthTimes[3].seconds - 1)).toBeLessThan(0.03);
    // Bests up to two hours: the decline is fitted, the runner's own.
    const long = fitWholeCurve(bests(7200), 'speed')!;
    expect(long.decline).toBe(true);
    expect(long.params.a).toBeCloseTo(0.3, 2);
    // The anaerobic reserve declines past TMAP by the authors' constant, the aerobic speed by A.
    const t = PT_TMAP * Math.E;
    const aerobic = 5 * (1 - (30 / t) * (1 - Math.exp(-t / 30))) - 0.3;
    const anaerobic = (250 / t) * (1 - Math.exp(-t / 20)) * (1 + PT_ANAEROBIC);
    expect(ptRate(truth, t)).toBeCloseTo(aerobic + anaerobic, 9);
  });

  it('The markers of the current week up to today', () => {
    // Today a Wednesday; a run of all-out bests 88 days before: in the 90 days of the table of bests, so in today's critical speed.
    const bests = [120, 180, 300, 600, 900, 1200].map((duration) => ({ duration, speed: 4 + 200 / duration, power: null }));
    const summary: LoadSummary = { duration: 3600, hrFrom: 0, hr: [], hrPeak: null, normSpeed: null, normPower: null, bests, moving: 3600, avgHr: null, ef: null, decoupling: null };
    const weeks = markersOverTime([{ id: 'a', startTime: '2026-08-29T08:00:00', duration: 3600 }], { a: summary }, '2026-11-25');
    expect(weeks[weeks.length - 1].end).toBe('2026-11-29');
    expect(weeks[weeks.length - 1].cs).toBeCloseTo(4, 3);
  });

  it('The monotony of a week not over yet over the last 7 days', () => {
    // A history of three days: Monday 100, Tuesday 50, Wednesday (today) 100: the monotony of the days there
    // are, not of a week with four days of rest to come.
    const p = { fitnessDays: 42, fatigueDays: 7 };
    const days = formSeries([{ startTime: '2026-11-23T08:00:00', load: 100 }, { startTime: '2026-11-24T08:00:00', load: 50 }, { startTime: '2026-11-25T08:00:00', load: 100 }], p);
    const [week] = weeklyLoad(days);
    const mean = 250 / 3;
    const sd = Math.sqrt(((100 - mean) ** 2 * 2 + (50 - mean) ** 2) / 3);
    expect(week.load).toBe(250);
    expect(week.monotony).toBeCloseTo(Math.round((mean / sd) * 100) / 100, 6);
    // With the week before run (Monday to Sunday 60, 0, 80, 0, 100, 0, 120), Monday 100 and Tuesday 90 are read
    // with the five days before them, Foster's week ending today: over the two days alone the monotony was 19.
    const before = [60, 0, 80, 0, 100, 0, 120].map((load, k) => ({ startTime: `2026-11-${16 + k}T08:00:00`, load }));
    const two = weeklyLoad(formSeries([...before, { startTime: '2026-11-23T08:00:00', load: 100 }, { startTime: '2026-11-24T08:00:00', load: 90 }], p));
    const seven = [80, 0, 100, 0, 120, 100, 90];
    const m7 = 490 / 7;
    const sd7 = Math.sqrt(seven.reduce((s, v) => s + (v - m7) ** 2, 0) / 7);
    expect(two[1].load).toBe(190);
    expect(two[1].monotony).toBeCloseTo(Math.round((m7 / sd7) * 100) / 100, 6);
    expect(two[1].strain).toBe(Math.round(490 * (m7 / sd7)));
    // The week that is over keeps its own seven days.
    expect(two[0].load).toBe(360);
  });

  it('VO2max from heart rate past the warm-up', () => {
    // 10 minutes of warm-up at 2.5 m/s and 120 bpm, then 40 minutes at 3 m/s and 150 bpm: the steady part is the 40 minutes.
    const run = syntheticRun(3000, (t) => (t < 600 ? { speed: 2.5, heartRate: 120 } : { speed: 3, heartRate: 150 }));
    const s = summarizeLoad(run);
    expect(s.steadyMoving).toBe(2400);
    expect(s.steadyHr).toBe(150);
    expect(s.steadySpeed).toBeCloseTo(3, 6);
    // Rest 60, max 190: 3 m/s at 69 % of the reserve is about 55.5; the whole run, warm-up and all, would read lower.
    expect(hrVo2max(s, 60, 190)).toBeCloseTo(55.5, 1);
    const whole: LoadSummary = { ...s, steadyMoving: undefined, steadySpeed: undefined, steadyHr: undefined };
    expect(hrVo2max(whole, 60, 190)!).not.toBeCloseTo(55.5, 1);
    // Under 20 minutes past the warm-up: no estimate.
    expect(hrVo2max(summarizeLoad(syntheticRun(1500, () => ({ speed: 3, heartRate: 150 }))), 60, 190)).toBeNull();
  });

  it('Edwards counts nothing under half the maximum', () => {
    const at = (bpm: number): LoadSummary => ({ duration: 1800, hrFrom: bpm, hr: [1800], hrPeak: bpm, normSpeed: null, normPower: null, bests: [], moving: 1800, avgHr: bpm, ef: null, decoupling: null });
    // 30 minutes at 85 bpm, a maximum of 180 (half 90): Z1 of the zones of Settings, but under Edwards' 50 %.
    expect(edwardsTrimp(at(85), [114, 133, 152, 171], 180)).toBe(0);
    expect(edwardsTrimp(at(95), [114, 133, 152, 171], 180)).toBe(30);
    expect(edwardsTrimp(at(85), [114, 133, 152, 171])).toBe(30);
  });

  it('What if leaves the start of the averages to the runs', () => {
    // Ten days of history, then weeks at 300 %: the past days of the scenario stay those of the runs alone.
    const runs = Array.from({ length: 10 }, (_, k) => ({ startTime: new Date(2026, 10, 16 + k, 8).toISOString(), load: 50 }));
    const p = { fitnessDays: 42, fatigueDays: 7 };
    const past = formSeries(runs, p, '2026-11-25');
    const w = loadWhatIf(runs, p, '2026-11-25', [300, 300]);
    expect(w.days.slice(0, past.length)).toEqual(past);
  });
});
