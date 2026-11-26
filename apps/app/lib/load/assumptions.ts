import { CURVE_DURATIONS } from '@/lib/curve';
import { duration as fmtDuration, pace as fmtPace } from '@/lib/format';
import { msg, number, t, tn } from '@/lib/i18n';
import { LOAD_MODELS, type PerformanceSettings } from '@/lib/settings';
import { BANISTER_MIN_POINTS, BANISTER_MIN_SPAN, TAU1_RANGE, TAU2_RANGE, fitBanister, type BanisterFit } from './banister';
import { ALLOUT_MEAN, bestEfforts, effortEvidence, type BestEffort, type EffortEvidence } from './efforts';
import type { FormDay } from './form';
import { DECOUPLING_MIN, EF_TREND_DAYS, MARKER_DAYS, SEILER_SHARES, efficiencyNow, efficiencyRuns, intensityShares, markersOverTime, seilerByWeek, weeklyLoad, type LoadWeek, type MarkerWeek } from './insights';
import { MIN_RESERVE_SECONDS, autoMaxHr, criticalSeries, type CriticalAt, type LoadRow } from './models';
import { WARMUP, type LoadSummary } from './summary';
import { RATE_PRECISION, RESERVE_PRECISION, markerRanges, relativeSe, type MarkerRanges, type Range } from './uncertainty';
import { HR_VO2_MEDIAN_DAYS, HR_VO2_MIN_RESERVE, HR_VO2_MIN_SECONDS, VDOT_MIN_SECONDS, hrVo2Now, hrVo2Runs, performancesFor, uthVo2max, vdotOverTime } from './vo2';

/**
 * What each model of the Performance screen rests on and assumes, checked against the runner's data
 * (the author's request of 21 Nov 2026: "chce wiedziec jakie sa zalezenia ... np. jesli nigdy nie
 * pobieglem na max na 3 min to krzywa mocy jest bezwartosciowa"; requirement "Model assumptions
 * checked", ADR "Models grouped by evidence, assumptions checked").
 */

/** met: the data show it holds; doubt: they leave it in doubt; unmet: they show it does not; unknown: the files cannot tell, the runner must judge. */
export type CheckStatus = 'met' | 'doubt' | 'unmet' | 'unknown';
export interface Check {
  key: string;
  /** the assumption, as a statement that should hold */
  label: string;
  status: CheckStatus;
  /** what the data show */
  detail: string;
}

/** ok: every assumption that can be checked holds; rough: some are in doubt; no: some do not hold; nodata: nothing to compute it from. */
export type Trust = 'ok' | 'rough' | 'no' | 'nodata';
/** The models by the evidence they rest on. */
export type ModelGroup = 'load' | 'capacity' | 'aerobic' | 'response';
export type ModelKey =
  | 'load' | 'form' | 'acwr' | 'weekly' | 'intensity'
  | 'efforts' | 'cs' | 'predictions' | 'vdot' | 'powerEfforts' | 'cp'
  | 'ef' | 'decoupling' | 'vo2hr' | 'uth'
  | 'fittedHr' | 'fittedVdot';

export interface ModelReport {
  key: ModelKey;
  group: ModelGroup;
  /** its depth in the group's tree: a model is drawn under what it rests on */
  depth: number;
  name: string;
  /** the method and its source */
  method: string;
  /** what it tells */
  tells: string;
  /** the data and settings it rests on */
  inputs: string[];
  /** the models it rests on */
  parents: ModelKey[];
  /** where it is shown: the tab and view of the Performance screen */
  where: { tab: string; view?: string };
  checks: Check[];
  /** by its own checks */
  own: Trust;
  /** capped by the models it rests on */
  trust: Trust;
  /** the model that caps its trust, when one does */
  cappedBy: ModelKey | null;
}

/**
 * The texts of a report (its names, methods, inputs, checks) are made in the language in use when it is
 * built, while a screen renders; a model's key, group, tab and view stay the same in every language.
 */

/** The values now, as the checks read them and the overview shows them. */
export interface PerformanceNow {
  loadModel: string;
  loadUnit: string;
  restHr: number;
  maxHr: number | null;
  day: FormDay | null;
  week: LoadWeek | null;
  shares: { low: number; moderate: number; high: number; seconds: number };
  marker: MarkerWeek | null;
  vdot: number | null;
  efforts: (BestEffort | null)[];
  evidence: EffortEvidence;
  powerEfforts: (BestEffort | null)[];
  powerEvidence: EffortEvidence;
  /** the bests of every length of the curve, 30 s to 2 h, in the window of the markers: pace and power */
  curve: (BestEffort | null)[];
  powerCurve: (BestEffort | null)[];
  ef: number | null;
  decoupling: number | null;
  vo2hr: number | null;
  uth: number | null;
  fitted: { hr: BanisterFit | null; vdot: BanisterFit | null };
  /** how far today's markers may lie, by the jackknife of their bests */
  ranges: MarkerRanges;
}

export type ReportRow = LoadRow & { device?: string; heartRateSource?: string | null; load?: number | null; loadEstimated?: boolean };

export interface ReportInput {
  rows: ReportRow[];
  summaries: Record<string, LoadSummary>;
  performance: PerformanceSettings;
  /** the heart rate zones of Settings, and whether the runner saved them (else the defaults apply) */
  hrZones: number[];
  zonesOwn: boolean;
  /** the daily series of load, fitness, fatigue and form up to today */
  days: FormDay[];
  today: string;
}

/** The thresholds of the checks (model's choices), named where a check states them. */
export const THRESHOLDS = {
  /** all-out bests at this many lengths, as this many separate efforts */
  lengths: 3,
  /** the best of 3 min or less over the best of 15 min or more: clearly faster from the first, flat under the second */
  ratioClear: 1.07,
  ratioFlat: 1.03,
  /** an all-out effort this recent, days */
  recentDays: 42,
  /** D′ of a runner, m */
  dPrime: [50, 500] as [number, number],
  /** the share of runs a model must cover: holds from the first, in doubt from the second */
  coverage: [0.9, 0.7] as [number, number],
  /** easy runs in the trend's window, long runs in the markers' window, runs for the heart rate estimate */
  easyRuns: 4,
  longRuns: 3,
  vo2Runs: 5,
  /** VO2max from heart rate and VDOT agree within the first, disagree beyond the second (fractions) */
  agree: [0.1, 0.2] as [number, number],
  /** R² of the fitted model, cross-validated: predicts the performances from the first, says little under the second */
  r2: [0.5, 0.3] as [number, number],
  /** the fatigue term matters from this share of the fitness term */
  fatigueShare: 0.02,
  /** a registered heart rate sensor in this share of the runs */
  strapShare: 0.8,
};

export type Thresholds = typeof THRESHOLDS;

/**
 * The thresholds the runner can set in Settings, Models (the runner's "tak" to setting them there):
 * each by its key (a pair's ends as .0 and .1), in the unit shown (scale: the unit per stored value),
 * within a range that keeps the check meaningful. Its group, label and unit are shown through t().
 */
export const THRESHOLD_FIELDS: { key: string; group: string; label: string; unit: string; scale: number; min: number; max: number }[] = [
  { key: 'strapShare', group: msg('Heart rate'), label: msg('A heart rate strap in at least'), unit: msg('% of the runs'), scale: 100, min: 0, max: 100 },
  { key: 'coverage.0', group: msg('Data'), label: msg('A model holds when it covers at least'), unit: msg('% of the runs'), scale: 100, min: 0, max: 100 },
  { key: 'coverage.1', group: msg('Data'), label: msg('and is in doubt from'), unit: msg('% of the runs'), scale: 100, min: 0, max: 100 },
  { key: 'easyRuns', group: msg('Data'), label: msg('Easy runs for the efficiency trend, at least'), unit: msg('runs'), scale: 1, min: 1, max: 50 },
  { key: 'longRuns', group: msg('Data'), label: msg('Long runs for decoupling, at least'), unit: msg('runs'), scale: 1, min: 1, max: 50 },
  { key: 'vo2Runs', group: msg('Data'), label: msg('Runs for VO2max from heart rate, at least'), unit: msg('runs'), scale: 1, min: 1, max: 50 },
  { key: 'lengths', group: msg('Best efforts'), label: msg('All-out bests, at least'), unit: msg('lengths of 2–20 min'), scale: 1, min: 1, max: 6 },
  { key: 'recentDays', group: msg('Best efforts'), label: msg('An all-out effort within'), unit: msg('days'), scale: 1, min: 7, max: 365 },
  { key: 'ratioClear', group: msg('Best efforts'), label: msg('The 3-minute best clearly faster than the 15-minute from'), unit: msg('% faster'), scale: 100, min: 0, max: 30 },
  { key: 'ratioFlat', group: msg('Best efforts'), label: msg('and flat under'), unit: msg('% faster'), scale: 100, min: 0, max: 30 },
  { key: 'dPrime.0', group: msg('Best efforts'), label: msg('D′ of a runner from'), unit: 'm', scale: 1, min: 0, max: 2000 },
  { key: 'dPrime.1', group: msg('Best efforts'), label: msg('to'), unit: 'm', scale: 1, min: 0, max: 2000 },
  { key: 'agree.0', group: msg('Agreement'), label: msg('VO2max from heart rate and VDOT agree within'), unit: '%', scale: 100, min: 0, max: 100 },
  { key: 'agree.1', group: msg('Agreement'), label: msg('and disagree beyond'), unit: '%', scale: 100, min: 0, max: 100 },
  { key: 'r2.0', group: msg('Fitted response'), label: msg('The fit predicts the performances left out from R²'), unit: '', scale: 1, min: 0, max: 1 },
  { key: 'r2.1', group: msg('Fitted response'), label: msg('and says little under R²'), unit: '', scale: 1, min: 0, max: 1 },
  { key: 'fatigueShare', group: msg('Fitted response'), label: msg('Fatigue matters from'), unit: msg('% of fitness'), scale: 100, min: 0, max: 100 },
];

/** A threshold's value now, stored (a share as a fraction), by its key. */
export function thresholdValue(thresholds: Thresholds, key: string): number {
  const [k, i] = key.split('.');
  const v = (thresholds as unknown as Record<string, number | number[]>)[k];
  return Array.isArray(v) ? v[Number(i)] : v;
}

/** The thresholds with the runner's own (Settings, Models) over the defaults; one out of its range keeps its default. */
export function thresholdsOf(own: Record<string, number> = {}): Thresholds {
  const out = structuredClone(THRESHOLDS) as unknown as Record<string, number | number[]>;
  for (const f of THRESHOLD_FIELDS) {
    const v = own[f.key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v * f.scale < f.min || v * f.scale > f.max) continue;
    const [k, i] = f.key.split('.');
    if (Array.isArray(out[k])) (out[k] as number[])[Number(i)] = v; else out[k] = v;
  }
  return out as unknown as Thresholds;
}

const DAY = 86_400_000;
const ORDER: Trust[] = ['ok', 'rough', 'no'];
const worse = (a: Trust, b: Trust): Trust => (a === 'nodata' ? a : ORDER[Math.max(ORDER.indexOf(a), ORDER.indexOf(b === 'nodata' ? 'no' : b))]);
const minutes = (ds: number[]) => (ds.length ? `${ds.map((d) => number(d / 60)).join(', ')} min` : t('none'));
const pct = (v: number) => `${number(Math.round(v * 100))} %`;
const check = (key: string, label: string, status: CheckStatus, detail: string): Check => ({ key, label, status, detail });
// i18n-ignore
const graded = (v: number, [good, fair]: [number, number]): CheckStatus => (v >= good ? 'met' : v >= fair ? 'doubt' : 'unmet');

/**
 * Every model of the Performance screen with what it rests on, its assumptions checked against the
 * data, and its trust; and the values now.
 */
export function performanceReport(input: ReportInput): { now: PerformanceNow; models: ModelReport[] } {
  // The runner's thresholds over the defaults (Settings, Models).
  const T = thresholdsOf(input.performance.thresholds);
  const { rows, summaries, performance: p, hrZones, zonesOwn, days, today } = input;
  const have = rows.filter((r) => summaries[r.id]);
  const model = LOAD_MODELS.find((m) => m.key === p.load)!;
  const maxHr = p.maxHr ?? autoMaxHr(have.map((r) => summaries[r.id]));
  const end = new Date(`${today}T23:59:59`).getTime();
  const inWindow = have.filter((r) => { const at = Date.parse(r.startTime); return at > end - MARKER_DAYS * DAY && at <= end; });

  // The values now.
  const weeks = markersOverTime(have, summaries, today, p.curve);
  const marker = weeks[weeks.length - 1] ?? null;
  const vdot = marker ? vdotOverTime([marker])[0].vdot : null;
  const efforts = bestEfforts(have, summaries, 'speed', maxHr, today);
  const powerEfforts = bestEfforts(have, summaries, 'power', maxHr, today);
  // The bests of every length of the curve, 30 s to 2 h, for the whole-curve models.
  const curve = bestEfforts(have, summaries, 'speed', maxHr, today, MARKER_DAYS, CURVE_DURATIONS);
  const powerCurve = bestEfforts(have, summaries, 'power', maxHr, today, MARKER_DAYS, CURVE_DURATIONS);
  const evidence = effortEvidence(efforts, today);
  const powerEvidence = effortEvidence(powerEfforts, today);
  const effRuns = efficiencyRuns(have, summaries, maxHr);
  const eff = efficiencyNow(effRuns, today);
  const perRun = maxHr ? hrVo2Runs(have, summaries, p.restHr, maxHr) : [];
  const vo2 = hrVo2Now(perRun, today);
  const uth = maxHr ? uthVo2max(p.restHr, maxHr) : null;
  const shares = intensityShares(seilerByWeek(have, summaries, maxHr).slice(-12));
  const loadWeeks = weeklyLoad(days);
  const loads = days.map((d) => ({ date: d.date, load: d.load }));
  const fitted = {
    hr: fitBanister(loads, performancesFor('hr', have, summaries, p.restHr, maxHr, today)),
    vdot: fitBanister(loads, performancesFor('vdot', have, summaries, p.restHr, maxHr, today)),
  };
  const ranges = markerRanges(have, summaries, today, p.curve);
  const now: PerformanceNow = {
    loadModel: t(model.name), loadUnit: model.unit, restHr: p.restHr, maxHr,
    day: days[days.length - 1] ?? null, week: loadWeeks[loadWeeks.length - 1] ?? null, shares,
    marker, vdot, efforts, evidence, powerEfforts, powerEvidence, curve, powerCurve,
    ef: eff.ef, decoupling: eff.decoupling, vo2hr: vo2.value, uth, fitted, ranges,
  };

  // Checks shared by several models.
  const withHr = have.filter((r) => summaries[r.id].hr.length > 0);
  const strapShare = withHr.length ? withHr.filter((r) => r.heartRateSource && !r.heartRateSource.startsWith('wrist')).length / withHr.length : 0;
  const restLabel = t('Your resting heart rate is set');
  const restCheck = (why: string) => (p.confirmed
    ? check('resthr', restLabel, 'met', t('{bpm} bpm, saved in Model', { bpm: p.restHr }))
    : check('resthr', restLabel, 'doubt', t('{bpm} bpm is the default, never saved: {why}', { bpm: p.restHr, why })));
  const maxLabel = t('Your maximum heart rate is known');
  const maxCheck = (why: string) => (p.maxHr !== null
    ? check('maxhr', maxLabel, 'met', t('{bpm} bpm, set in Model', { bpm: p.maxHr }))
    : maxHr
      ? check('maxhr', maxLabel, 'doubt', t('{bpm} bpm is the highest in your runs: too low if you have never gone all out, and then {why}', { bpm: maxHr, why }))
      : check('maxhr', maxLabel, 'unmet', t('no heart rate in the runs')));
  const zonesCheck = (why: string, lacking: CheckStatus = 'unmet') => (zonesOwn && hrZones.length
    ? check('zones', t('The heart rate zones are yours'), 'met', tn(hrZones.length + 1, '{n} zones, saved in Settings', '{n} zones, saved in Settings'))
    : check('zones', t('The heart rate zones are yours'), lacking, t('the default zones apply (60–90 % of a maximum of 190 bpm): {why}', { why })));
  const hrCheck = () => {
    const share = have.length ? withHr.length / have.length : 0;
    return check('hr', t('Heart rate in the runs'), graded(share, T.coverage), tn(have.length, '{count} of {n} runs have a heart rate', '{count} of {n} runs have a heart rate', { count: number(withHr.length) }));
  };
  const sensorLabel = t('The heart rate comes from a strap');
  const sensorCheck = () => (strapShare >= T.strapShare
    ? check('sensor', sensorLabel, 'met', t('a registered sensor in {share} of the runs', { share: pct(strapShare) }))
    : strapShare > 0
      ? check('sensor', sensorLabel, 'doubt', t("a registered sensor in {share} of the runs, the watch's wrist sensor in the rest: the two read differently, most at high intensity", { share: pct(strapShare) }))
      : check('sensor', sensorLabel, 'unknown', t("no heart rate sensor is registered in Settings → Gear, so the watch's wrist sensor is assumed: it misreads most at high intensity and in the cold")));
  const recorded = () => check('recorded', t('All your training is here'), 'unknown', t('only the runs of this folder count: other sports, and runs not imported, are missing from the load'));

  /** The checks of the bests the curve models are fitted to; `what` is the model fitted to them, shown in a detail. */
  const effortChecks = (e: EffortEvidence, what: string): Check[] => {
    const out: Check[] = [];
    out.push(check('lengths', t('Bests at {lengths} lengths or more of 2–20 min in the last {days} days', { lengths: T.lengths, days: MARKER_DAYS }), e.lengths >= T.lengths ? 'met' : 'unmet',
      tn(e.lengths, '{n} of 6 lengths have a best', '{n} of 6 lengths have a best')));
    const list = t('all-out: {allOut} · hard: {hard} · not all-out: {easy}', { allOut: minutes(e.allOut), hard: minutes(e.hard), easy: minutes(e.easy) });
    const allOutLabel = t('All-out efforts at {lengths} lengths or more', { lengths: T.lengths });
    out.push(e.lengths > 0 && e.unknown === e.lengths
      ? check('allout', allOutLabel, 'unknown', t('no heart rate in the bests: whether they were all-out cannot be told'))
      : check('allout', allOutLabel, e.allOut.length >= T.lengths ? 'met' : e.allOut.length + e.hard.length >= T.lengths ? 'doubt' : 'unmet',
        t('{list}. A best that was not all-out lies below what you can do, and {what} with it', { list, what })));
    out.push(maxCheck(t('the efforts look harder than they were')));
    out.push(check('separate', t('The bests are {lengths} separate efforts or more', { lengths: T.lengths }), e.distinct >= T.lengths ? 'met' : e.distinct === 2 ? 'doubt' : 'unmet',
      tn(e.distinct, '{n} separate effort: a best cut out of a longer one is not all-out for its own length', '{n} separate efforts: a best cut out of a longer one is not all-out for its own length')));
    const shapeLabel = t('Short efforts are clearly stronger than long ones');
    out.push(e.ratio === null
      ? check('shape', shapeLabel, 'unknown', t('needs a best of 3 min or less and one of 15 min or more'))
      : check('shape', shapeLabel, e.ratio >= T.ratioClear ? 'met' : e.ratio >= T.ratioFlat ? 'doubt' : 'unmet',
        t('the shortest best is {above} above the longest ({expected} or more expected): {verdict}', {
          above: pct(e.ratio - 1), expected: pct(T.ratioClear - 1),
          verdict: e.ratio >= T.ratioClear ? t('the curve falls as an all-out curve does') : t('a flat curve means the short efforts were held back'),
        })));
    const recentLabel = t('An all-out effort in the last {days} days', { days: T.recentDays });
    out.push(e.newestAllOut === null
      ? check('recent', recentLabel, 'doubt', t('none'))
      : check('recent', recentLabel, e.newestAllOut <= T.recentDays ? 'met' : 'doubt', tn(e.newestAllOut, 'the newest was {n} days ago', 'the newest was {n} days ago')));
    return out;
  };

  /**
   * Whether the bests settle a critical rate and its reserve: the standard errors of the jackknife of the
   * runs against RATE_PRECISION and RESERVE_PRECISION, in doubt past them; unknown under 3 runs, or when
   * the fit has no value without one of them.
   */
  const preciseCheck = (label: string, rate: Range | null, reserve: Range | null, show: (r: Range) => string, showReserve: (r: Range) => string): Check => {
    const a = relativeSe(rate);
    const b = relativeSe(reserve);
    if (a === null || b === null || !rate || !reserve) return check('precise', label, 'unknown', t('it takes 3 runs or more in the last {days} days, and a fit that stands without any one of them, to leave each out in turn and see how far it moves', { days: MARKER_DAYS }));
    return check('precise', label, a <= RATE_PRECISION && b <= RESERVE_PRECISION ? 'met' : 'doubt', t('{rate} and {reserve} (95 %) with each run left out in turn: standard errors of {rateShare} and {reserveShare}, {rateGood} and {reserveGood} or less expected; more means one run or two decide the value', {
      rate: show(rate), reserve: showReserve(reserve), rateShare: `${number(a * 100, 1)} %`, reserveShare: `${number(b * 100, 1)} %`, rateGood: pct(RATE_PRECISION), reserveGood: pct(RESERVE_PRECISION),
    }));
  };

  // Each model: what it rests on, whether it has a value, and its checks.
  type Def = Omit<ModelReport, 'checks' | 'own' | 'trust' | 'cappedBy'> & { has: boolean; checks: Check[] };
  const withLoad = rows.filter((r) => typeof r.load === 'number');
  const measured = withLoad.filter((r) => !r.loadEstimated).length;
  const counted = withLoad.length - measured;
  const coverage = check('coverage', t('Every run has what the model needs'), graded(withLoad.length ? measured / withLoad.length : 0, T.coverage),
    `${tn(withLoad.length, '{count} of {n} runs measured', '{count} of {n} runs measured', { count: number(measured) })}${counted ? `; ${tn(counted, '{n} counted from their duration', '{n} counted from their duration')}` : ''}`);
  /** The automatic threshold of the newest run: from its own 90 days, held from before, or the first one taken. */
  const lastCritical = (metric: 'speed' | 'power'): CriticalAt | null => {
    const last = [...have].sort((a, b) => b.startTime.localeCompare(a.startTime))[0];
    return last ? criticalSeries(have, summaries, metric)[last.id] ?? null : null;
  };
  /** With an automatic threshold: how the loads stand against scores that take the pace or power of an hour. */
  const scale = (what: string): Check => check('scale', t('The loads compare with those of other tools'), 'unknown', t('{what} is held for about half an hour, not an hour: against it a run scores several per cent less than against the threshold of an hour that such scores are named for. Set your own threshold in Model to match another tool', { what }));
  const autoThreshold = (label: string, c: CriticalAt | null, show: (v: number) => string): Check => (c === null
    ? check('threshold', label, 'unmet', t('no {days} days of bests show all-out short efforts (a reserve worth {s} s or more): every load is counted from its duration', { days: MARKER_DAYS, s: MIN_RESERVE_SECONDS }))
    : c.from === 'own'
      ? check('threshold', label, 'met', t('{value}, from the bests of the {days} days up to each run: as reliable as the efforts behind it', { value: show(c.rate), days: MARKER_DAYS }))
      : check('threshold', label, 'doubt', t('{value}, held from older bests: the last {days} days show no all-out short efforts (a reserve worth {s} s or more), so the threshold is not lowered to the pace of easy runs', { value: show(c.rate), days: MARKER_DAYS, s: MIN_RESERVE_SECONDS })));
  const loadDef: Pick<Def, 'inputs' | 'parents' | 'checks'> = p.load === 'trimpBanister'
    ? { inputs: [t('heart rate of every run'), t('resting heart rate'), t('maximum heart rate'), t('sex')], parents: [], checks: [coverage, restCheck(t('the reserve is counted from it')), maxCheck(t('every load comes out too high'))] }
    : p.load === 'trimpEdwards'
      ? { inputs: [t('heart rate of every run'), t('your heart rate zones')], parents: [], checks: [coverage, zonesCheck(t('the minutes are weighted by zones that are not yours'))] }
      : p.load === 'rtss'
        ? {
          inputs: [t('effort pace of every run'), t('threshold pace')], parents: p.thresholdPace === null ? ['cs'] : [],
          checks: [coverage, p.thresholdPace !== null
            ? check('threshold', t('The threshold pace is yours'), 'met', t('{pace} /km, set in Model', { pace: fmtPace(1000 / p.thresholdPace) }))
            : autoThreshold(t('The threshold pace is yours'), lastCritical('speed'), (v) => `${fmtPace(1000 / v)} /km`), ...(p.thresholdPace === null ? [scale(t('Critical speed'))] : [])],
        }
        : {
          inputs: [t('power of every run'), t('critical power')], parents: p.thresholdPower === null ? ['cp'] : [],
          checks: [coverage, p.thresholdPower !== null
            ? check('threshold', t('The critical power is yours'), 'met', t('{power} W, set in Model', { power: p.thresholdPower }))
            : autoThreshold(t('The critical power is yours'), lastCritical('power'), (v) => `${number(Math.round(v))} W`), ...(p.thresholdPower === null ? [scale(t('Critical power'))] : [])],
        };

  const powerRuns = inWindow.filter((r) => summaries[r.id].normPower !== null);
  const powerWatches = new Set(powerRuns.map((r) => r.device ?? t('unknown')));
  // The longest best the predictions were fitted to: 20 minutes for Riegel's law, the longest best of the window for the whole curve.
  const longest = p.curve === 'whole' ? Math.max(1200, ...curve.filter((e): e is BestEffort => e !== null).map((e) => e.duration)) : 1200;
  const race = (d: number) => marker?.predictions.find((x) => x.distance === d)?.seconds ?? null;
  const pointsLabel = t('{points} performances or more over {days} days', { points: BANISTER_MIN_POINTS, days: BANISTER_MIN_SPAN });
  const fittedDef = (fit: BanisterFit | null, name: string): Pick<Def, 'has' | 'checks'> => ({
    has: fit !== null,
    checks: fit === null
      ? [check('points', pointsLabel, 'unmet', t('too few performances, or no fit with positive gains'))]
      : [
        check('points', pointsLabel, 'met', tn(fit.n, '{n} performances ({what})', '{n} performances ({what})', { what: name })),
        check('fit', t('The loads predict the performances'), graded(fit.r2cv, T.r2),
          t('R² {r2cv} on the performances left out of each fit, {r2} on those fitted: the model predicts {share} of their variation ({expected} or more expected)', { r2cv: number(fit.r2cv, 2), r2: number(fit.r2, 2), share: pct(Math.max(0, fit.r2cv)), expected: pct(T.r2[0]) })),
        check('identified', t('Your data settle the time constants'), fit.tau1Range[0] > TAU1_RANGE[0] && fit.tau1Range[1] < TAU1_RANGE[1] && fit.tau2Range[0] > TAU2_RANGE[0] && fit.tau2Range[1] < TAU2_RANGE[1] ? 'met' : 'doubt',
          t('τ1 {tau1} d ({low1}–{high1} fit as well, 95 %) of {from1}–{to1} tried, τ2 {tau2} d ({low2}–{high2}) of {from2}–{to2}: a range that reaches the edge of what was tried is not settled by the data', {
            tau1: number(fit.tau1), low1: number(fit.tau1Range[0]), high1: number(fit.tau1Range[1]), from1: TAU1_RANGE[0], to1: TAU1_RANGE[1],
            tau2: number(fit.tau2), low2: number(fit.tau2Range[0]), high2: number(fit.tau2Range[1]), from2: TAU2_RANGE[0], to2: TAU2_RANGE[1],
          })),
        check('fatigue', t('Fatigue shows in the performances'), fit.terms.fatigue >= T.fatigueShare * fit.terms.fitness ? 'met' : 'doubt',
          t('the fatigue term is {share} of the fitness term: under {least} the model is fitness alone, and its taper says nothing', {
            share: pct(fit.terms.fitness > 0 ? fit.terms.fatigue / fit.terms.fitness : 0), least: pct(T.fatigueShare),
          })),
        check('stable', t('You respond the same way all through the period'), 'unknown', t('one set of gains and time constants is fitted to the whole period; they drift with training (Busso 2003)')),
      ],
  });

  const defs: Record<ModelKey, Def> = {
    load: {
      key: 'load', group: 'load', depth: 0, name: t('Load of a run · {model}', { model: t(model.name) }), method: t(model.about), tells: t('how much each run cost, in one number'),
      where: { tab: 'load', view: 'form' }, has: withLoad.length > 0, ...loadDef,
    },
    form: {
      key: 'form', group: 'load', depth: 1, name: t('Fitness and fatigue (impulse–response)'), method: t('Banister’s fitness–fatigue model as weighted averages of the daily load (CTL, ATL, TSB)'),
      tells: t('whether training outweighs recovery now'), inputs: [t('time constants {fitness} and {fatigue} days', { fitness: p.fitnessDays, fatigue: p.fatigueDays })], parents: ['load'], where: { tab: 'load', view: 'form' }, has: days.length > 0,
      checks: [
        check('history', t('Enough history for the averages to settle'), days.length >= 3 * p.fitnessDays ? 'met' : days.length >= p.fitnessDays ? 'doubt' : 'unmet',
          tn(days.length, '{n} days of runs; fitness needs about {need} (3 × {days}) to stop depending on where the history starts', '{n} days of runs; fitness needs about {need} (3 × {days}) to stop depending on where the history starts', { need: 3 * p.fitnessDays, days: p.fitnessDays })),
        recorded(),
        check('constants', t('The time constants fit you'), 'unknown', t('{fitness} and {fatigue} days are conventions, not measured for you; the Response tab fits yours', { fitness: p.fitnessDays, fatigue: p.fatigueDays })),
      ],
    },
    acwr: {
      key: 'acwr', group: 'load', depth: 1, name: t('Acute:chronic ratio'), method: t('7- over 28-day weighted average of the load (Williams et al. 2017)'), tells: t('how fast the load is changing'),
      inputs: [], parents: ['load'], where: { tab: 'load', view: 'form' }, has: (days[days.length - 1]?.acwr ?? null) !== null,
      checks: [
        check('history', t('28 days of history or more'), days.length >= 28 ? 'met' : 'unmet', tn(days.length, '{n} days', '{n} days')),
        check('band', t('The 0.8–1.3 band tells injury risk'), 'doubt', t("contested: Impellizzeri et al. 2020 found the ratio's link to injury unreliable; read it as the pace of change, not as a risk score")),
        recorded(),
      ],
    },
    weekly: {
      key: 'weekly', group: 'load', depth: 1, name: t('Weekly load, monotony and strain'), method: t('Foster 1998'), tells: t('how the load is spread over the days of a week'),
      inputs: [t('the load of each day of the week')], parents: ['load'], where: { tab: 'load', view: 'weekly' }, has: loadWeeks.length > 0,
      checks: [
        recorded(),
        check('guide', t('A monotony above 2 means too little variation for you'), 'unknown', t("from Foster's observations of athletes: a guide, not a limit measured for you")),
      ],
    },
    intensity: {
      key: 'intensity', group: 'load', depth: 0, name: t('Intensity distribution'), method: t('time at low, moderate and high intensity after Seiler: under 82 %, 82–87 % and above 87 % of the maximum heart rate'), tells: t('how hard you train, by time'),
      inputs: [t('heart rate of every run'), t('maximum heart rate')], parents: [], where: { tab: 'load', view: 'intensity' }, has: shares.seconds > 0,
      checks: [
        maxCheck(t('every share is read against it, and too low a maximum makes easy running look hard')), hrCheck(), sensorCheck(),
        check('thresholds', t('Your thresholds lie near 82 % and 87 % of your maximum'), 'unknown', t('Seiler’s zones are bounded by the first and second lactate thresholds; their shares of the maximum vary from runner to runner by several per cent')),
        check('method', t('Time in a zone is what you mean by intensity'), 'unknown', t('by time, a session of intervals looks easier than by its goal: its recoveries count as low intensity')),
      ],
    },
    efforts: {
      key: 'efforts', group: 'capacity', depth: 0, name: t('Best efforts of 2–20 min'), method: t('the best effort of each length in the last {days} days', { days: MARKER_DAYS }), tells: t('the pace you held at your hardest, by length'),
      inputs: [t('pace of your hardest efforts'), t('heart rate in them'), t('maximum heart rate')], parents: [], where: { tab: 'capacity', view: 'efforts' }, has: evidence.lengths >= T.lengths,
      checks: effortChecks(evidence, t('the critical speed')),
    },
    cs: {
      key: 'cs', group: 'capacity', depth: 1, name: t('Critical speed and D′'), method: t('distance = CS·time + D′ fitted to the bests as their envelope: none lies above it (Monod & Scherrer 1965; Jones & Vanhatalo 2017)'), tells: t('the fastest pace you can hold in a steady state, and the reserve above it'),
      inputs: [], parents: ['efforts'], where: { tab: 'capacity', view: 'critical' }, has: (marker?.cs ?? null) !== null,
      checks: marker?.dPrime === null || marker?.dPrime === undefined ? [] : [
        preciseCheck(t('Your bests settle the critical speed and D′'), ranges.cs, ranges.dPrime, (r) => `${fmtPace(r.high)}–${fmtPace(r.low)} /km`, (r) => `${number(Math.round(r.low))}–${number(Math.round(r.high))} m`),
        check('dprime', t("D′ comes out as a runner's ({from}–{to} m)", { from: T.dPrime[0], to: T.dPrime[1] }), marker.dPrime >= T.dPrime[0] && marker.dPrime <= T.dPrime[1] ? 'met' : 'doubt',
          marker.dPrime < T.dPrime[0]
            ? t('{d} m: so small a reserve means the short bests were held back, and the critical speed is then too high', { d: number(Math.round(marker.dPrime)) })
            : `${number(Math.round(marker.dPrime))} m`),
      ],
    },
    predictions: {
      key: 'predictions', group: 'capacity', depth: 1, name: t('Predicted race times'), method: p.curve === 'whole' ? t('Péronnet–Thibault fitted to the bests of 30 s to 2 h (Péronnet & Thibault 1989)') : t('Riegel’s law fitted to the bests of 3–20 min (Riegel 1981)'), tells: t('the times your bests imply at race distances'),
      inputs: [p.curve === 'whole' ? t('maximal aerobic speed, an anaerobic reserve and its decline past 7 minutes') : t('a power law of time beyond the efforts')], parents: ['efforts'], where: { tab: 'capacity', view: 'predictions' }, has: (marker?.predictions.length ?? 0) > 0,
      checks: race(21097.5) === null ? [] : [
        check('near', t('The 5 km and 10 km lie near the efforts fitted'), (race(10000) ?? Infinity) <= 3 * longest ? 'met' : 'doubt',
          t('10 km in {time}: {times} × the longest effort fitted ({longest} min)', { time: fmtDuration(Math.round(race(10000)!)), times: number(race(10000)! / longest, 1), longest: number(Math.round(longest / 60)) })),
        check('endurance', t('You have the endurance of the half and the marathon'), 'doubt',
          t('they last {half} × and {full} × the longest effort fitted: the law holds that far only for a runner trained for the distance', { half: number(race(21097.5)! / longest, 1), full: number(race(42195)! / longest, 1) })),
      ],
    },
    vdot: {
      key: 'vdot', group: 'capacity', depth: 2, name: t('VO2max as VDOT'), method: t('the VO2max a race time implies (Daniels & Gilbert 1979)'), tells: t('your capacity as one number, comparable with race tables'),
      inputs: [t('the predicted 5 km')], parents: ['efforts'], where: { tab: 'capacity', view: 'predictions' }, has: vdot !== null,
      checks: race(5000) === null ? [] : [
        check('near', t('The predicted 5 km lies within the lengths fitted'), race(5000)! <= 1.5 * longest ? 'met' : 'doubt', p.curve === 'whole' ? t('5 km in {time}, against efforts of 30 s to {longest} min', { time: fmtDuration(Math.round(race(5000)!)), longest: number(Math.round(longest / 60)) }) : t('5 km in {time}, against efforts of 3–20 min', { time: fmtDuration(Math.round(race(5000)!)) })),
      ],
    },
    powerEfforts: {
      key: 'powerEfforts', group: 'capacity', depth: 0, name: t('Best power of 2–20 min'), method: t('the highest average power of each length in the last {days} days', { days: MARKER_DAYS }), tells: t('the power you held at your hardest, by length'),
      inputs: [t('power of your hardest efforts'), t('heart rate in them'), t('maximum heart rate')], parents: [], where: { tab: 'capacity', view: 'efforts' }, has: powerEvidence.lengths >= T.lengths,
      checks: [
        check('power', t('Power in the runs'), graded(inWindow.length ? powerRuns.length / inWindow.length : 0, T.coverage),
          tn(inWindow.length, '{count} of {n} runs of the last {days} days have power', '{count} of {n} runs of the last {days} days have power', { count: number(powerRuns.length), days: MARKER_DAYS })),
        check('watch', t('The power comes from one watch'), powerWatches.size <= 1 ? 'met' : 'doubt', powerWatches.size <= 1 ? [...powerWatches][0] ?? t('no power')
          : t('{watches}: running power is computed differently by each make and model, so their watts do not compare', { watches: [...powerWatches].join(` ${t('and')} `) })),
        ...effortChecks(powerEvidence, t('the critical power')),
      ],
    },
    cp: {
      key: 'cp', group: 'capacity', depth: 1, name: t('Critical power and W′'), method: t('work = CP·time + W′ fitted to the bests as their envelope: none lies above it (Monod & Scherrer 1965)'), tells: t('the highest power you can hold in a steady state, and the work above it'),
      inputs: [], parents: ['powerEfforts'], where: { tab: 'capacity', view: 'critical' }, has: (marker?.cp ?? null) !== null,
      checks: marker?.wPrime === null || marker?.wPrime === undefined ? [] : [
        preciseCheck(t('Your bests settle the critical power and W′'), ranges.cp, ranges.wPrime, (r) => `${number(Math.round(r.low))}–${number(Math.round(r.high))} W`, (r) => `${number(r.low / 1000, 1)}–${number(r.high / 1000, 1)} kJ`),
        check('wprime', t('W′ comes out positive'), marker.wPrime > 0 ? 'met' : 'doubt',
          marker.wPrime <= 0 ? t('{kj} kJ: the short bests were held back', { kj: number(marker.wPrime / 1000, 1) }) : `${number(marker.wPrime / 1000, 1)} kJ`),
      ],
    },
    ef: {
      key: 'ef', group: 'aerobic', depth: 0, name: t('Efficiency factor'), method: t('mean speed per mean heart rate while moving, the easy runs'), tells: t('the speed you get for a heartbeat at an easy effort'),
      inputs: [t('pace and heart rate of every run'), t('maximum heart rate (a run is easy with a mean under {share} of it)', { share: pct(SEILER_SHARES[0]) })], parents: [], where: { tab: 'aerobic', view: 'efficiency' }, has: eff.ef !== null,
      checks: [
        check('easy', t('{runs} easy runs or more in the last {days} days', { runs: T.easyRuns, days: EF_TREND_DAYS }), eff.easyRuns >= T.easyRuns ? 'met' : eff.easyRuns > 0 ? 'doubt' : 'unmet',
          tn(eff.easyRuns, '{n} easy run (mean heart rate under {share} of the maximum)', '{n} easy runs (mean heart rate under {share} of the maximum)', { share: pct(SEILER_SHARES[0]) })),
        maxCheck(t('fewer runs count as easy than are')), hrCheck(), sensorCheck(),
        check('conditions', t('The runs share terrain and weather'), 'unknown', t('hills, heat and wind move the factor as much as fitness does')),
      ],
    },
    decoupling: {
      key: 'decoupling', group: 'aerobic', depth: 0, name: t('Aerobic decoupling'), method: t('the efficiency of a long run’s first half against its second, past the first {warmup} min (Pa:HR, Friel)', { warmup: WARMUP / 60 }), tells: t('whether your heart rate drifts up at a steady pace'),
      inputs: [t('pace and heart rate of runs of {min} min and more', { min: DECOUPLING_MIN / 60 })], parents: [], where: { tab: 'aerobic', view: 'decoupling' }, has: eff.decoupling !== null,
      checks: [
        check('long', t('{runs} long runs or more in the last {days} days', { runs: T.longRuns, days: MARKER_DAYS }), eff.longRuns90 >= T.longRuns ? 'met' : eff.longRuns90 > 0 ? 'doubt' : 'unmet',
          tn(eff.longRuns90, '{n} run of {min} min or more', '{n} runs of {min} min or more', { min: DECOUPLING_MIN / 60 })),
        sensorCheck(),
        check('steady', t('The long runs are steady'), 'unknown', t('intervals, hills and a fast finish raise it without any drift of the heart')),
      ],
    },
    vo2hr: {
      key: 'vo2hr', group: 'aerobic', depth: 0, name: t('VO2max from heart rate'), method: t('the oxygen cost of the pace (ACSM) over the share of the heart rate reserve used (Swain 1997)'), tells: t('your capacity guessed from everyday runs'),
      inputs: [t('pace and heart rate of runs of {min} min and more past the first {warmup} min, at {share} of the reserve', { min: HR_VO2_MIN_SECONDS / 60, warmup: WARMUP / 60, share: pct(HR_VO2_MIN_RESERVE) }), t('resting heart rate'), t('maximum heart rate')], parents: [], where: { tab: 'aerobic', view: 'vo2' }, has: vo2.value !== null,
      checks: [
        check('runs', t('{runs} runs or more in the last {days} days', { runs: T.vo2Runs, days: HR_VO2_MEDIAN_DAYS }), vo2.runs >= T.vo2Runs ? 'met' : vo2.runs > 0 ? 'doubt' : 'unmet',
          tn(vo2.runs, '{n} run long and hard enough', '{n} runs long and hard enough')),
        restCheck(t('the estimate moves by about 1 ml/kg/min for every 2 bpm of it')), maxCheck(t('the estimate comes out too low')), sensorCheck(),
        ...(vo2.value !== null && vdot !== null ? [(() => {
          const apart = Math.abs(vo2.value! - vdot) / vdot;
          const vars = { hr: number(vo2.value!), vdot: number(vdot), apart: pct(apart) };
          return check('agrees', t('It agrees with the VDOT from your bests (within {share})', { share: pct(T.agree[0]) }), apart <= T.agree[0] ? 'met' : apart <= T.agree[1] ? 'doubt' : 'unmet',
            apart > T.agree[0]
              ? t('{hr} against {vdot}: {apart} apart. One of them is off: check the resting and maximum heart rate, and whether the bests were all-out', vars)
              : t('{hr} against {vdot}: {apart} apart', vars));
        })()] : []),
        check('level', t('Level ground at a steady effort'), 'unknown', t('the equation is for level running: hills, heat and a drifting heart rate lower the estimate')),
      ],
    },
    uth: {
      key: 'uth', group: 'aerobic', depth: 0, name: t('VO2max by Uth’s ratio'), method: t('15.3 × maximum ÷ resting heart rate (Uth et al. 2004)'), tells: t('a population figure, for reference'),
      inputs: [t('resting heart rate'), t('maximum heart rate')], parents: [], where: { tab: 'aerobic', view: 'vo2' }, has: uth !== null,
      checks: [
        restCheck(t('the ratio follows it directly')), maxCheck(t('the ratio comes out too low')),
        check('population', t('A population formula fits you'), 'doubt', t('fitted to 46 trained men; for one person it is off by about ±5 ml/kg/min, and it knows nothing of your running')),
      ],
    },
    fittedHr: {
      key: 'fittedHr', group: 'response', depth: 0, name: t('Fitted response · VO2max from heart rate'), method: t('performance = p0 + k1·fitness − k2·fatigue, fitted to you (Banister 1975; Busso 2003)'), tells: t('your own time constants, and when a rest would peak'),
      inputs: [t('the load of every day'), t('VO2max from heart rate of each run')], parents: ['load', 'vo2hr'], where: { tab: 'response' }, ...fittedDef(fitted.hr, t("VO2max from heart rate, a day's mean")),
    },
    fittedVdot: {
      key: 'fittedVdot', group: 'response', depth: 0, name: t('Fitted response · VDOT'), method: t('the same model, fitted to the VDOT of the all-out efforts of each day'), tells: t('your own time constants, on your hardest efforts'),
      inputs: [t('the load of every day'), t('the VDOT of each all-out effort of {min} min or more (Daniels)', { min: VDOT_MIN_SECONDS / 60 }), t('heart rate in the efforts'), t('maximum heart rate')], parents: ['load'], where: { tab: 'response' },
      ...(() => {
        const d = fittedDef(fitted.vdot, t('VDOT of all-out efforts'));
        return { ...d, checks: [...d.checks, maxCheck(t('efforts that were all-out are left out')),
          check('maximal', t('Each effort is the most you could do'), 'unknown', t('an effort counts by its heart rate, a mean of {mean} of the maximum or more held over it: a rep of a session or a tempo run reaches that without being a race, and reads a lower VDOT than you have', { mean: pct(ALLOUT_MEAN) }))] };
      })(),
    },
  };

  // Trust: the worst of a model's own checks, capped by the models it rests on.
  const done = new Map<ModelKey, ModelReport>();
  const resolve = (key: ModelKey): ModelReport => {
    const known = done.get(key);
    if (known) return known;
    const { has, ...d } = defs[key];
    const own: Trust = !has ? 'nodata' : d.checks.some((c) => c.status === 'unmet') ? 'no' : d.checks.some((c) => c.status === 'doubt') ? 'rough' : 'ok';
    let trust = own;
    let cappedBy: ModelKey | null = null;
    for (const parent of d.parents) {
      const capped = worse(trust, resolve(parent).trust);
      if (capped !== trust) { trust = capped; cappedBy = parent; }
    }
    const report: ModelReport = { ...d, own, trust, cappedBy };
    done.set(key, report);
    return report;
  };
  const order: ModelKey[] = ['load', 'form', 'acwr', 'weekly', 'intensity', 'efforts', 'cs', 'predictions', 'vdot', 'powerEfforts', 'cp', 'ef', 'decoupling', 'vo2hr', 'uth', 'fittedHr', 'fittedVdot'];
  return { now, models: order.map(resolve) };
}

/**
 * The models the chosen load model changes (the runner's "myslalem ze w zaleznosci od wybranego
 * modelu banister etc ... inne metryki beda dostepne a inne nie"): the load of a run and every model
 * resting on it, directly or through another; the rest (the best efforts, the aerobic ones) do not
 * move when it is changed.
 */
export function onLoad(models: Pick<ModelReport, 'key' | 'parents'>[]): Set<ModelKey> {
  const by = new Map(models.map((m) => [m.key, m]));
  const rests = (k: ModelKey, seen: Set<ModelKey>): boolean => {
    if (k === 'load') return true;
    if (seen.has(k)) return false;
    seen.add(k);
    return (by.get(k)?.parents ?? []).some((p) => rests(p, seen));
  };
  return new Set(models.filter((m) => rests(m.key, new Set())).map((m) => m.key));
}
