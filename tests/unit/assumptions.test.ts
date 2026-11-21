import { describe, expect, it } from 'vitest';
import { bestEfforts, effortEvidence, effortOf, formSeries, performanceReport, summarizeLoad, type BestOfLength, type LoadSummary, type ModelKey, type ModelReport, type ReportInput } from '@/lib/load';
import { DEFAULT_PERFORMANCE, type PerformanceSettings } from '@/lib/settings';
import { syntheticRun } from '../support/synthetic';

const TODAY = '2026-11-21';
const HR_ZONES = [114, 133, 152, 171];
const summary = (bests: BestOfLength[], extra: Partial<LoadSummary> = {}): LoadSummary => ({
  duration: 3600, hrFrom: 150, hr: [3600], hrPeak: 178, normSpeed: 3.5, normPower: null, bests, moving: 3600, avgHr: 150, ef: 1.4, decoupling: 2, ...extra,
});
const row = (id: string, day: string) => ({ id, startTime: `${day}T07:00:00`, duration: 3600, load: 80, device: 'COROS PACE 4', heartRateSource: 'Arm band' });
/** A best of a length: its speed, where it lies, and the heart rate in it (the same for its peak and its mean). */
const best = (duration: number, speed: number, at: [number, number], hr: number, power: number | null = null): BestOfLength => ({
  duration, speed, power, speedAt: at, speedHr: hr, speedHrPeak: hr, ...(power === null ? {} : { powerAt: at, powerHr: hr, powerHrPeak: hr }),
});

/** Four hard days: all-out bests of every length, as separate efforts, the short ones clearly faster. */
const ALL_OUT = {
  rows: [row('a', '2026-11-01'), row('b', '2026-11-05'), row('c', '2026-11-10'), row('d', '2026-11-15')],
  summaries: {
    a: summary([best(120, 5.0, [600, 720], 172), best(180, 4.8, [600, 780], 174)]),
    b: summary([best(300, 4.6, [900, 1200], 170)]),
    c: summary([best(600, 4.35, [600, 1200], 168), best(900, 4.25, [500, 1400], 167)]),
    d: summary([best(1200, 4.15, [300, 1500], 166)]),
  },
};
/** The runner's example: never all-out — every best is cut out of one steady 20 minutes at 81 % of the maximum heart rate. */
const NEVER_ALL_OUT = {
  rows: [row('e', '2026-11-10')],
  summaries: { e: summary([120, 180, 300, 600, 900, 1200].map((d, k) => best(d, 4.2 - 0.008 * k, [600, 600 + d], 150, 260 - 2 * k)), { normPower: 250 }) },
};
const SET: PerformanceSettings = { ...DEFAULT_PERFORMANCE, maxHr: 185, confirmed: true };

const report = (data: { rows: ReturnType<typeof row>[]; summaries: Record<string, LoadSummary> }, performance: PerformanceSettings, over: Partial<ReportInput> = {}) => {
  const days = formSeries(data.rows.map((r) => ({ startTime: r.startTime, load: r.load })), performance, TODAY);
  const out = performanceReport({ ...data, performance, hrZones: HR_ZONES, zonesOwn: true, days, today: TODAY, ...over });
  return { ...out, by: Object.fromEntries(out.models.map((m) => [m.key, m])) as Record<ModelKey, ModelReport> };
};
const status = (m: ModelReport, key: string) => m.checks.find((c) => c.key === key)?.status;

describe('Model assumptions', () => {
  it('Best efforts classed by their heart rate', () => {
    // Up to 3 min the peak of the heart rate: all-out from 90 % of the maximum, hard from 85 %.
    expect(effortOf(180, 167, 185)).toBe('allout');
    expect(effortOf(180, 160, 185)).toBe('hard');
    expect(effortOf(180, 150, 185)).toBe('easy');
    // Longer, the mean after the first 90 s: all-out from 88 %.
    expect(effortOf(600, 163, 185)).toBe('allout');
    expect(effortOf(600, 160, 185)).toBe('hard');
    expect(effortOf(600, null, 185)).toBe('unknown');
    expect(effortOf(600, 170, null)).toBe('unknown');

    // The summary of a run keeps where each best lies and the heart rate in it: 30 easy minutes (130 bpm) with 5 hard ones (175 bpm) from minute 10.
    const s = summarizeLoad(syntheticRun(1800, (t) => (t >= 600 && t < 900 ? { speed: 5, heartRate: 175 } : { speed: 3, heartRate: 130 })));
    const five = s.bests.find((b) => b.duration === 300)!;
    expect(Math.abs(five.speedAt![0] - 600)).toBeLessThanOrEqual(2);
    expect(five.speedHr).toBe(175);
    expect(effortOf(300, five.speedHr, 185)).toBe('allout');
    // Its best 10 minutes are those 5 with 5 easy ones: the peak is as high, the mean is not, so it is no all-out 10 minutes.
    const ten = s.bests.find((b) => b.duration === 600)!;
    expect(ten.speedHrPeak).toBe(175);
    expect(ten.speedHr!).toBeLessThan(160);
    expect(effortOf(600, ten.speedHr, 185)).toBe('easy');

    // The bests of the last 90 days, each from the run that holds it; a run older than that is left out.
    const old = { rows: [...ALL_OUT.rows, row('old', '2026-06-01')], summaries: { ...ALL_OUT.summaries, old: summary([best(120, 6, [0, 120], 180)]) } };
    const efforts = bestEfforts(old.rows, old.summaries, 'speed', 185, TODAY);
    expect(efforts.map((e) => [e!.duration, e!.runId, e!.effort, e!.hrKind])).toEqual([
      [120, 'a', 'allout', 'peak'], [180, 'a', 'allout', 'peak'], [300, 'b', 'allout', 'mean'], [600, 'c', 'allout', 'mean'], [900, 'c', 'allout', 'mean'], [1200, 'd', 'allout', 'mean'],
    ]);
    // Together: six all-out lengths as four separate efforts (overlapping stretches of a run are one), the shortest 20 % above the longest, the newest 6 days old.
    expect(effortEvidence(efforts, TODAY)).toEqual({ lengths: 6, allOut: [120, 180, 300, 600, 900, 1200], hard: [], easy: [], unknown: 0, distinct: 4, ratio: 1.205, newestAllOut: 6 });
    // One steady effort: six lengths, none all-out, one effort, a flat curve.
    const flat = effortEvidence(bestEfforts(NEVER_ALL_OUT.rows, NEVER_ALL_OUT.summaries, 'speed', 185, TODAY), TODAY);
    expect(flat).toMatchObject({ lengths: 6, allOut: [], easy: [120, 180, 300, 600, 900, 1200], distinct: 1, newestAllOut: null });
    expect(flat.ratio!).toBeLessThan(1.03);
    expect(bestEfforts(ALL_OUT.rows, ALL_OUT.summaries, 'power', 185, TODAY)).toEqual([null, null, null, null, null, null]);
  });

  it('Assumptions checked against the data', () => {
    // All-out, separate efforts and a known maximum heart rate: the bests and what rests on them are reliable.
    const good = report(ALL_OUT, SET);
    for (const k of ['allout', 'separate', 'shape', 'recent', 'maxhr']) expect(status(good.by.efforts, k), k).toBe('met');
    expect(good.by.efforts.trust).toBe('ok');
    expect(good.by.cs).toMatchObject({ trust: 'ok', parents: ['efforts'], cappedBy: null });
    expect(good.by.vdot.trust).toBe('ok');
    // The half and the marathon lie far beyond the efforts: the predictions are rough at best.
    expect(status(good.by.predictions, 'endurance')).toBe('doubt');
    expect(good.by.predictions.trust).toBe('rough');
    // No power in the runs: nothing to compute the power models from.
    expect(good.by.powerEfforts.trust).toBe('nodata');
    expect(good.by.cp.trust).toBe('nodata');
    expect(good.now.marker!.cs!).toBeGreaterThan(4);

    // The runner's example: never all-out. The bests fail, and critical speed, critical power and VDOT with them.
    const never = report(NEVER_ALL_OUT, SET);
    for (const k of ['allout', 'separate', 'shape']) expect(status(never.by.efforts, k), k).toBe('unmet');
    expect(never.by.efforts.trust).toBe('no');
    expect(never.by.cs).toMatchObject({ trust: 'no', cappedBy: 'efforts' });
    expect(never.by.vdot.trust).toBe('no');
    expect(status(never.by.powerEfforts, 'allout')).toBe('unmet');
    expect(never.by.cp).toMatchObject({ trust: 'no', cappedBy: 'powerEfforts' });
    // What rests on them falls too: rTSS against the critical speed, and the response fitted to the VDOT.
    const rtss = report(NEVER_ALL_OUT, { ...SET, load: 'rtss' });
    expect(rtss.by.load).toMatchObject({ parents: ['cs'], own: 'ok', trust: 'no', cappedBy: 'cs' });
    expect(rtss.by.form.trust).toBe('no');
    expect(report(NEVER_ALL_OUT, { ...SET, load: 'rtss', thresholdPace: 250 }).by.load).toMatchObject({ parents: [], trust: 'ok' });

    // A maximum heart rate taken from the runs: the hardest run is all-out by definition, so the bests are rough at best.
    const auto = report(ALL_OUT, { ...SET, maxHr: null });
    expect(auto.now.maxHr).toBe(178);
    expect(status(auto.by.efforts, 'maxhr')).toBe('doubt');
    expect(auto.by.efforts.trust).toBe('rough');
    expect(auto.by.cs).toMatchObject({ own: 'ok', trust: 'rough', cappedBy: 'efforts' });

    // The load model's own assumptions: a resting heart rate never saved; zones that are the defaults.
    expect(status(report(ALL_OUT, { ...SET, confirmed: false }).by.load, 'resthr')).toBe('doubt');
    expect(report(ALL_OUT, { ...SET, confirmed: false }).by.load.trust).toBe('rough');
    const edwards = report(ALL_OUT, { ...SET, load: 'trimpEdwards' }, { zonesOwn: false });
    expect(status(edwards.by.load, 'zones')).toBe('unmet');
    expect(edwards.by.load.trust).toBe('no');
    expect(edwards.by.intensity.trust).toBe('no');
    // Three weeks of history: the form's averages have not settled; too few performances for a fitted model.
    expect(status(good.by.form, 'history')).toBe('unmet');
    expect(good.by.fittedHr.trust).toBe('nodata');
    // What the files cannot tell is left to the runner, and lowers no trust.
    expect(status(good.by.form, 'recorded')).toBe('unknown');
    expect(status(good.by.intensity, 'sensor')).toBe('met');
    const wrist = report({ rows: ALL_OUT.rows.map((r) => ({ ...r, heartRateSource: 'wrist (COROS PACE 4)' })), summaries: ALL_OUT.summaries }, SET);
    expect(status(wrist.by.intensity, 'sensor')).toBe('unknown');
    expect(wrist.by.intensity.trust).toBe('ok');
    // Every model says what it rests on and where it is shown.
    for (const m of good.models) { expect(m.inputs.length + m.parents.length, m.key).toBeGreaterThan(0); expect(m.where.tab, m.key).toBeTruthy(); }
  });
});
