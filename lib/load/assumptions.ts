import { duration as fmtDuration, pace as fmtPace } from '@/lib/format';
import { LOAD_MODELS, type PerformanceSettings } from '@/lib/settings';
import { BANISTER_MIN_POINTS, BANISTER_MIN_SPAN, TAU1_RANGE, TAU2_RANGE, fitBanister, type BanisterFit } from './banister';
import { bestEfforts, effortEvidence, type BestEffort, type EffortEvidence } from './efforts';
import type { FormDay } from './form';
import { DECOUPLING_MIN, EF_TREND_DAYS, MARKER_DAYS, efficiencyNow, efficiencyRuns, intensityShares, markersOverTime, weeklyLoad, zonesByWeek, type LoadWeek, type MarkerWeek } from './insights';
import { autoMaxHr, type LoadRow } from './models';
import type { LoadSummary } from './summary';
import { HR_VO2_MEDIAN_DAYS, HR_VO2_MIN_RESERVE, HR_VO2_MIN_SECONDS, hrVo2Now, hrVo2Runs, performancesFor, uthVo2max, vdotOverTime } from './vo2';

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
  ef: number | null;
  decoupling: number | null;
  vo2hr: number | null;
  uth: number | null;
  fitted: { hr: BanisterFit | null; vdot: BanisterFit | null };
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
  /** R² of the fitted model: explains the performances from the first, says little under the second */
  r2: [0.5, 0.3] as [number, number],
  /** the fatigue term matters from this share of the fitness term */
  fatigueShare: 0.02,
  /** a registered heart rate sensor in this share of the runs */
  strapShare: 0.8,
};

const DAY = 86_400_000;
const ORDER: Trust[] = ['ok', 'rough', 'no'];
const worse = (a: Trust, b: Trust): Trust => (a === 'nodata' ? a : ORDER[Math.max(ORDER.indexOf(a), ORDER.indexOf(b === 'nodata' ? 'no' : b))]);
const minutes = (ds: number[]) => (ds.length ? `${ds.map((d) => d / 60).join(', ')} min` : 'none');
const pct = (v: number) => `${Math.round(v * 100)} %`;
const check = (key: string, label: string, status: CheckStatus, detail: string): Check => ({ key, label, status, detail });
const graded = (v: number, [good, fair]: [number, number]): CheckStatus => (v >= good ? 'met' : v >= fair ? 'doubt' : 'unmet');

/**
 * Every model of the Performance screen with what it rests on, its assumptions checked against the
 * data, and its trust; and the values now.
 */
export function performanceReport(input: ReportInput): { now: PerformanceNow; models: ModelReport[] } {
  const { rows, summaries, performance: p, hrZones, zonesOwn, days, today } = input;
  const have = rows.filter((r) => summaries[r.id]);
  const model = LOAD_MODELS.find((m) => m.key === p.load)!;
  const maxHr = p.maxHr ?? autoMaxHr(have.map((r) => summaries[r.id]));
  const end = new Date(`${today}T23:59:59`).getTime();
  const inWindow = have.filter((r) => { const t = Date.parse(r.startTime); return t > end - MARKER_DAYS * DAY && t <= end; });

  // The values now.
  const weeks = markersOverTime(have, summaries, today);
  const marker = weeks[weeks.length - 1] ?? null;
  const vdot = marker ? vdotOverTime([marker])[0].vdot : null;
  const efforts = bestEfforts(have, summaries, 'speed', maxHr, today);
  const powerEfforts = bestEfforts(have, summaries, 'power', maxHr, today);
  const evidence = effortEvidence(efforts, today);
  const powerEvidence = effortEvidence(powerEfforts, today);
  const effRuns = efficiencyRuns(have, summaries, hrZones);
  const eff = efficiencyNow(effRuns);
  const perRun = maxHr ? hrVo2Runs(have, summaries, p.restHr, maxHr) : [];
  const vo2 = hrVo2Now(perRun);
  const uth = maxHr ? uthVo2max(p.restHr, maxHr) : null;
  const zoneWeeks = zonesByWeek(have, summaries, hrZones).slice(-12);
  const shares = intensityShares(zoneWeeks);
  const loadWeeks = weeklyLoad(days);
  const loads = days.map((d) => ({ date: d.date, load: d.load }));
  const fitted = {
    hr: fitBanister(loads, performancesFor('hr', have, summaries, p.restHr, maxHr, today)),
    vdot: fitBanister(loads, performancesFor('vdot', have, summaries, p.restHr, maxHr, today)),
  };
  const now: PerformanceNow = {
    loadModel: model.name, loadUnit: model.unit, restHr: p.restHr, maxHr,
    day: days[days.length - 1] ?? null, week: loadWeeks[loadWeeks.length - 1] ?? null, shares,
    marker, vdot, efforts, evidence, powerEfforts, powerEvidence,
    ef: eff.ef, decoupling: eff.decoupling, vo2hr: vo2.value, uth, fitted,
  };

  // Checks shared by several models.
  const withHr = have.filter((r) => summaries[r.id].hr.length > 0);
  const strapShare = withHr.length ? withHr.filter((r) => r.heartRateSource && !r.heartRateSource.startsWith('wrist')).length / withHr.length : 0;
  const restCheck = (why: string) => (p.confirmed
    ? check('resthr', 'Your resting heart rate is set', 'met', `${p.restHr} bpm, saved in Model`)
    : check('resthr', 'Your resting heart rate is set', 'doubt', `${p.restHr} bpm is the default, never saved: ${why}`));
  const maxCheck = (why: string) => (p.maxHr !== null
    ? check('maxhr', 'Your maximum heart rate is known', 'met', `${p.maxHr} bpm, set in Model`)
    : maxHr
      ? check('maxhr', 'Your maximum heart rate is known', 'doubt', `${maxHr} bpm is the highest in your runs: too low if you have never gone all out, and then ${why}`)
      : check('maxhr', 'Your maximum heart rate is known', 'unmet', 'no heart rate in the runs'));
  const zonesCheck = (why: string, lacking: CheckStatus = 'unmet') => (zonesOwn && hrZones.length
    ? check('zones', 'The heart rate zones are yours', 'met', `${hrZones.length + 1} zones, saved in Settings`)
    : check('zones', 'The heart rate zones are yours', lacking, `the default zones apply (60–90 % of a maximum of 190 bpm): ${why}`));
  const hrCheck = () => { const share = have.length ? withHr.length / have.length : 0; return check('hr', 'Heart rate in the runs', graded(share, THRESHOLDS.coverage), `${withHr.length} of ${have.length} runs have a heart rate`); };
  const sensorCheck = () => (strapShare >= THRESHOLDS.strapShare
    ? check('sensor', 'The heart rate comes from a strap', 'met', `a registered sensor in ${pct(strapShare)} of the runs`)
    : strapShare > 0
      ? check('sensor', 'The heart rate comes from a strap', 'doubt', `a registered sensor in ${pct(strapShare)} of the runs, the watch's wrist sensor in the rest: the two read differently, most at high intensity`)
      : check('sensor', 'The heart rate comes from a strap', 'unknown', 'no heart rate sensor is registered in Settings → Gear, so the watch\'s wrist sensor is assumed: it misreads most at high intensity and in the cold'));
  const recorded = () => check('recorded', 'All your training is here', 'unknown', 'only the runs of this folder count: other sports, and runs not imported, are missing from the load');

  /** The checks of the bests the curve models are fitted to. */
  const effortChecks = (e: EffortEvidence, what: string): Check[] => {
    const out: Check[] = [];
    out.push(check('lengths', `Bests at ${THRESHOLDS.lengths} lengths or more of 2–20 min in the last ${MARKER_DAYS} days`, e.lengths >= THRESHOLDS.lengths ? 'met' : 'unmet', `${e.lengths} of 6 lengths have a best`));
    const list = `all-out: ${minutes(e.allOut)} · hard: ${minutes(e.hard)} · not all-out: ${minutes(e.easy)}`;
    out.push(e.lengths > 0 && e.unknown === e.lengths
      ? check('allout', `All-out efforts at ${THRESHOLDS.lengths} lengths or more`, 'unknown', 'no heart rate in the bests: whether they were all-out cannot be told')
      : check('allout', `All-out efforts at ${THRESHOLDS.lengths} lengths or more`, e.allOut.length >= THRESHOLDS.lengths ? 'met' : e.allOut.length + e.hard.length >= THRESHOLDS.lengths ? 'doubt' : 'unmet',
        `${list}. A best that was not all-out lies below what you can do, and ${what} with it`));
    out.push(maxCheck('the efforts look harder than they were'));
    out.push(check('separate', `The bests are ${THRESHOLDS.lengths} separate efforts or more`, e.distinct >= THRESHOLDS.lengths ? 'met' : e.distinct === 2 ? 'doubt' : 'unmet',
      `${e.distinct} separate effort${e.distinct === 1 ? '' : 's'}: a best cut out of a longer one is not all-out for its own length`));
    out.push(e.ratio === null
      ? check('shape', 'Short efforts are clearly stronger than long ones', 'unknown', 'needs a best of 3 min or less and one of 15 min or more')
      : check('shape', 'Short efforts are clearly stronger than long ones', e.ratio >= THRESHOLDS.ratioClear ? 'met' : e.ratio >= THRESHOLDS.ratioFlat ? 'doubt' : 'unmet',
        `the shortest best is ${pct(e.ratio - 1)} above the longest (${pct(THRESHOLDS.ratioClear - 1)} or more expected): ${e.ratio >= THRESHOLDS.ratioClear ? 'the curve falls as an all-out curve does' : 'a flat curve means the short efforts were held back'}`));
    out.push(e.newestAllOut === null
      ? check('recent', `An all-out effort in the last ${THRESHOLDS.recentDays} days`, 'doubt', 'none')
      : check('recent', `An all-out effort in the last ${THRESHOLDS.recentDays} days`, e.newestAllOut <= THRESHOLDS.recentDays ? 'met' : 'doubt', `the newest was ${e.newestAllOut} days ago`));
    return out;
  };

  // Each model: what it rests on, whether it has a value, and its checks.
  type Def = Omit<ModelReport, 'checks' | 'own' | 'trust' | 'cappedBy'> & { has: boolean; checks: Check[] };
  const withLoad = rows.filter((r) => typeof r.load === 'number');
  const measured = withLoad.filter((r) => !r.loadEstimated).length;
  const coverage = check('coverage', 'Every run has what the model needs', graded(withLoad.length ? measured / withLoad.length : 0, THRESHOLDS.coverage),
    `${measured} of ${withLoad.length} runs measured${withLoad.length - measured ? `; ${withLoad.length - measured} counted from their duration` : ''}`);
  const loadDef: Pick<Def, 'inputs' | 'parents' | 'checks'> = p.load === 'trimpBanister'
    ? { inputs: ['heart rate of every run', 'resting heart rate', 'maximum heart rate', 'sex'], parents: [], checks: [coverage, restCheck('the reserve is counted from it'), maxCheck('every load comes out too high')] }
    : p.load === 'trimpEdwards'
      ? { inputs: ['heart rate of every run', 'your heart rate zones'], parents: [], checks: [coverage, zonesCheck('the minutes are weighted by zones that are not yours')] }
      : p.load === 'rtss'
        ? {
          inputs: ['effort pace of every run', 'threshold pace'], parents: p.thresholdPace === null ? ['cs'] : [],
          checks: [coverage, p.thresholdPace !== null
            ? check('threshold', 'The threshold pace is yours', 'met', `${fmtPace(1000 / p.thresholdPace)} /km, set in Model`)
            : check('threshold', 'The threshold pace is yours', 'met', `taken from the critical speed of the ${MARKER_DAYS} days up to each run: as reliable as the efforts behind it`)],
        }
        : {
          inputs: ['power of every run', 'critical power'], parents: p.thresholdPower === null ? ['cp'] : [],
          checks: [coverage, p.thresholdPower !== null
            ? check('threshold', 'The critical power is yours', 'met', `${p.thresholdPower} W, set in Model`)
            : check('threshold', 'The critical power is yours', 'met', `taken from the bests of the ${MARKER_DAYS} days up to each run: as reliable as the efforts behind it`)],
        };

  const powerRuns = inWindow.filter((r) => summaries[r.id].normPower !== null);
  const powerWatches = new Set(powerRuns.map((r) => r.device ?? 'unknown'));
  const longest = 1200;
  const race = (d: number) => marker?.predictions.find((x) => x.distance === d)?.seconds ?? null;
  const fittedDef = (fit: BanisterFit | null, name: string): Pick<Def, 'has' | 'checks'> => ({
    has: fit !== null,
    checks: fit === null
      ? [check('points', `${BANISTER_MIN_POINTS} performances or more over ${BANISTER_MIN_SPAN} days`, 'unmet', 'too few performances, or no fit with positive gains')]
      : [
        check('points', `${BANISTER_MIN_POINTS} performances or more over ${BANISTER_MIN_SPAN} days`, 'met', `${fit.n} performances (${name})`),
        check('fit', 'The loads explain the performances', graded(fit.r2, THRESHOLDS.r2), `R² ${fit.r2.toFixed(2)}: the model explains ${pct(Math.max(0, fit.r2))} of their variation (${pct(THRESHOLDS.r2[0])} or more expected)`),
        check('identified', 'Your data settle the time constants', fit.tau1 > TAU1_RANGE[0] && fit.tau1 < TAU1_RANGE[1] && fit.tau2 > TAU2_RANGE[0] && fit.tau2 < TAU2_RANGE[1] ? 'met' : 'doubt',
          `τ1 ${fit.tau1} d of ${TAU1_RANGE[0]}–${TAU1_RANGE[1]} tried, τ2 ${fit.tau2} d of ${TAU2_RANGE[0]}–${TAU2_RANGE[1]}: one at the edge of its range is not settled by the data`),
        check('fatigue', 'Fatigue shows in the performances', fit.terms.fatigue >= THRESHOLDS.fatigueShare * fit.terms.fitness ? 'met' : 'doubt',
          `the fatigue term is ${pct(fit.terms.fitness > 0 ? fit.terms.fatigue / fit.terms.fitness : 0)} of the fitness term: under ${pct(THRESHOLDS.fatigueShare)} the model is fitness alone, and its taper says nothing`),
        check('stable', 'You respond the same way all through the period', 'unknown', 'one set of gains and time constants is fitted to the whole period; they drift with training (Busso 2003)'),
      ],
  });

  const defs: Record<ModelKey, Def> = {
    load: {
      key: 'load', group: 'load', depth: 0, name: `Load of a run · ${model.name}`, method: model.about, tells: 'how much each run cost, in one number',
      where: { tab: 'model' }, has: withLoad.length > 0, ...loadDef,
    },
    form: {
      key: 'form', group: 'load', depth: 1, name: 'Fitness, fatigue and form', method: 'Banister’s fitness–fatigue model as weighted averages of the daily load (CTL, ATL, TSB)',
      tells: 'whether training outweighs recovery now', inputs: [`time constants ${p.fitnessDays} and ${p.fatigueDays} days`], parents: ['load'], where: { tab: 'load', view: 'form' }, has: days.length > 0,
      checks: [
        check('history', 'Enough history for the averages to settle', days.length >= 3 * p.fitnessDays ? 'met' : days.length >= p.fitnessDays ? 'doubt' : 'unmet',
          `${days.length} days of runs; fitness needs about ${3 * p.fitnessDays} (3 × ${p.fitnessDays}) to stop depending on where the history starts`),
        recorded(),
        check('constants', 'The time constants fit you', 'unknown', `${p.fitnessDays} and ${p.fatigueDays} days are conventions, not measured for you; the Response tab fits yours`),
      ],
    },
    acwr: {
      key: 'acwr', group: 'load', depth: 1, name: 'Acute:chronic ratio', method: '7- over 28-day weighted average of the load (Williams et al. 2017)', tells: 'how fast the load is changing',
      inputs: [], parents: ['load'], where: { tab: 'load', view: 'form' }, has: (days[days.length - 1]?.acwr ?? null) !== null,
      checks: [
        check('history', '28 days of history or more', days.length >= 28 ? 'met' : 'unmet', `${days.length} days`),
        check('band', 'The 0.8–1.3 band tells injury risk', 'doubt', 'contested: Impellizzeri et al. 2020 found the ratio\'s link to injury unreliable; read it as the pace of change, not as a risk score'),
        recorded(),
      ],
    },
    weekly: {
      key: 'weekly', group: 'load', depth: 1, name: 'Weekly load, monotony and strain', method: 'Foster 1998', tells: 'how the load is spread over the days of a week',
      inputs: ['the load of each day of the week'], parents: ['load'], where: { tab: 'load', view: 'weekly' }, has: loadWeeks.length > 0,
      checks: [
        recorded(),
        check('guide', 'A monotony above 2 means too little variation for you', 'unknown', 'from Foster\'s observations of athletes: a guide, not a limit measured for you'),
      ],
    },
    intensity: {
      key: 'intensity', group: 'load', depth: 0, name: 'Intensity distribution', method: 'time in the heart rate zones; low, moderate and high after Seiler', tells: 'how hard you train, by time',
      inputs: ['heart rate of every run', 'your heart rate zones'], parents: [], where: { tab: 'load', view: 'intensity' }, has: shares.seconds > 0,
      checks: [
        zonesCheck('the shares say nothing about you until you set yours'), hrCheck(), sensorCheck(),
        check('method', 'Time in a zone is what you mean by intensity', 'unknown', 'by time, a session of intervals looks easier than by its goal: its recoveries count as low intensity'),
      ],
    },
    efforts: {
      key: 'efforts', group: 'capacity', depth: 0, name: 'Best efforts of 2–20 min', method: `the fastest stretch of each length in the last ${MARKER_DAYS} days`, tells: 'the pace you held at your hardest, by length',
      inputs: ['pace of your hardest stretches', 'heart rate in them', 'maximum heart rate'], parents: [], where: { tab: 'capacity', view: 'efforts' }, has: evidence.lengths >= THRESHOLDS.lengths,
      checks: effortChecks(evidence, 'the critical speed'),
    },
    cs: {
      key: 'cs', group: 'capacity', depth: 1, name: 'Critical speed and D′', method: 'distance = CS·time + D′ fitted to the bests (Monod & Scherrer 1965; Jones & Vanhatalo 2017)', tells: 'the fastest pace you can hold in a steady state, and the reserve above it',
      inputs: [], parents: ['efforts'], where: { tab: 'capacity', view: 'critical' }, has: (marker?.cs ?? null) !== null,
      checks: marker?.dPrime === null || marker?.dPrime === undefined ? [] : [
        check('dprime', `D′ comes out as a runner's (${THRESHOLDS.dPrime[0]}–${THRESHOLDS.dPrime[1]} m)`, marker.dPrime >= THRESHOLDS.dPrime[0] && marker.dPrime <= THRESHOLDS.dPrime[1] ? 'met' : 'doubt',
          `${Math.round(marker.dPrime)} m${marker.dPrime < THRESHOLDS.dPrime[0] ? ': so small a reserve means the short bests were held back, and the critical speed is then too high' : ''}`),
      ],
    },
    predictions: {
      key: 'predictions', group: 'capacity', depth: 1, name: 'Predicted race times', method: 'Riegel’s law fitted to the bests of 3–20 min (Riegel 1981)', tells: 'the times your bests imply at race distances',
      inputs: ['a power law of time beyond the efforts'], parents: ['efforts'], where: { tab: 'capacity', view: 'predictions' }, has: (marker?.predictions.length ?? 0) > 0,
      checks: race(21097.5) === null ? [] : [
        check('near', 'The 5 km and 10 km lie near the efforts fitted', (race(10000) ?? Infinity) <= 3 * longest ? 'met' : 'doubt',
          `10 km in ${fmtDuration(Math.round(race(10000)!))}: ${(race(10000)! / longest).toFixed(1)} × the longest effort fitted (20 min)`),
        check('endurance', 'You have the endurance of the half and the marathon', 'doubt',
          `they last ${(race(21097.5)! / longest).toFixed(1)} × and ${(race(42195)! / longest).toFixed(1)} × the longest effort fitted: the law holds that far only for a runner trained for the distance`),
      ],
    },
    vdot: {
      key: 'vdot', group: 'capacity', depth: 2, name: 'VO2max as VDOT', method: 'the VO2max a race time implies (Daniels & Gilbert 1979)', tells: 'your capacity as one number, comparable with race tables',
      inputs: ['the predicted 5 km'], parents: ['efforts'], where: { tab: 'capacity', view: 'predictions' }, has: vdot !== null,
      checks: race(5000) === null ? [] : [
        check('near', 'The predicted 5 km lies within the lengths fitted', race(5000)! <= 1.5 * longest ? 'met' : 'doubt', `5 km in ${fmtDuration(Math.round(race(5000)!))}, against efforts of 3–20 min`),
      ],
    },
    powerEfforts: {
      key: 'powerEfforts', group: 'capacity', depth: 0, name: 'Best power of 2–20 min', method: `the highest average power of each length in the last ${MARKER_DAYS} days`, tells: 'the power you held at your hardest, by length',
      inputs: ['power of your hardest stretches', 'heart rate in them', 'maximum heart rate'], parents: [], where: { tab: 'capacity', view: 'efforts' }, has: powerEvidence.lengths >= THRESHOLDS.lengths,
      checks: [
        check('power', 'Power in the runs', graded(inWindow.length ? powerRuns.length / inWindow.length : 0, THRESHOLDS.coverage), `${powerRuns.length} of ${inWindow.length} runs of the last ${MARKER_DAYS} days have power`),
        check('watch', 'The power comes from one watch', powerWatches.size <= 1 ? 'met' : 'doubt', powerWatches.size <= 1 ? [...powerWatches][0] ?? 'no power' : `${[...powerWatches].join(' and ')}: running power is computed differently by each make and model, so their watts do not compare`),
        ...effortChecks(powerEvidence, 'the critical power'),
      ],
    },
    cp: {
      key: 'cp', group: 'capacity', depth: 1, name: 'Critical power and W′', method: 'work = CP·time + W′ fitted to the bests (Monod & Scherrer 1965)', tells: 'the highest power you can hold in a steady state, and the work above it',
      inputs: [], parents: ['powerEfforts'], where: { tab: 'capacity', view: 'critical' }, has: (marker?.cp ?? null) !== null,
      checks: marker?.wPrime === null || marker?.wPrime === undefined ? [] : [
        check('wprime', 'W′ comes out positive', marker.wPrime > 0 ? 'met' : 'doubt', `${(marker.wPrime / 1000).toFixed(1)} kJ${marker.wPrime <= 0 ? ': the short bests were held back' : ''}`),
      ],
    },
    ef: {
      key: 'ef', group: 'aerobic', depth: 0, name: 'Efficiency factor', method: 'mean speed per mean heart rate while moving, the easy runs', tells: 'the speed you get for a heartbeat at an easy effort',
      inputs: ['pace and heart rate of every run', 'your heart rate zones (which runs are easy)'], parents: [], where: { tab: 'aerobic', view: 'efficiency' }, has: eff.ef !== null,
      checks: [
        check('easy', `${THRESHOLDS.easyRuns} easy runs or more in the last ${EF_TREND_DAYS} days`, eff.easyRuns >= THRESHOLDS.easyRuns ? 'met' : eff.easyRuns > 0 ? 'doubt' : 'unmet', `${eff.easyRuns} easy run${eff.easyRuns === 1 ? '' : 's'} (mean heart rate in Z1–Z2)`),
        zonesCheck('which runs count as easy is decided by zones that are not yours', 'doubt'), hrCheck(), sensorCheck(),
        check('conditions', 'The runs share terrain and weather', 'unknown', 'hills, heat and wind move the factor as much as fitness does'),
      ],
    },
    decoupling: {
      key: 'decoupling', group: 'aerobic', depth: 0, name: 'Aerobic decoupling', method: 'the efficiency of a long run’s first half against its second (Pa:HR, Friel)', tells: 'whether your heart rate drifts up at a steady pace',
      inputs: [`pace and heart rate of runs of ${DECOUPLING_MIN / 60} min and more`], parents: [], where: { tab: 'aerobic', view: 'decoupling' }, has: eff.decoupling !== null,
      checks: [
        check('long', `${THRESHOLDS.longRuns} long runs or more in the last ${MARKER_DAYS} days`, eff.longRuns90 >= THRESHOLDS.longRuns ? 'met' : eff.longRuns90 > 0 ? 'doubt' : 'unmet', `${eff.longRuns90} run${eff.longRuns90 === 1 ? '' : 's'} of ${DECOUPLING_MIN / 60} min or more`),
        sensorCheck(),
        check('steady', 'The long runs are steady', 'unknown', 'intervals, hills and a fast finish raise it without any drift of the heart'),
      ],
    },
    vo2hr: {
      key: 'vo2hr', group: 'aerobic', depth: 0, name: 'VO2max from heart rate', method: 'the oxygen cost of the pace (ACSM) over the share of the heart rate reserve used (Swain 1997)', tells: 'your capacity guessed from everyday runs',
      inputs: [`pace and heart rate of runs of ${HR_VO2_MIN_SECONDS / 60} min and more at ${pct(HR_VO2_MIN_RESERVE)} of the reserve`, 'resting heart rate', 'maximum heart rate'], parents: [], where: { tab: 'aerobic', view: 'vo2' }, has: vo2.value !== null,
      checks: [
        check('runs', `${THRESHOLDS.vo2Runs} runs or more in the last ${HR_VO2_MEDIAN_DAYS} days`, vo2.runs >= THRESHOLDS.vo2Runs ? 'met' : vo2.runs > 0 ? 'doubt' : 'unmet', `${vo2.runs} run${vo2.runs === 1 ? '' : 's'} long and hard enough`),
        restCheck('the estimate moves by about 1 ml/kg/min for every 2 bpm of it'), maxCheck('the estimate comes out too low'), sensorCheck(),
        ...(vo2.value !== null && vdot !== null ? [(() => {
          const apart = Math.abs(vo2.value! - vdot) / vdot;
          return check('agrees', `It agrees with the VDOT from your bests (within ${pct(THRESHOLDS.agree[0])})`, apart <= THRESHOLDS.agree[0] ? 'met' : apart <= THRESHOLDS.agree[1] ? 'doubt' : 'unmet',
            `${vo2.value} against ${vdot}: ${pct(apart)} apart${apart > THRESHOLDS.agree[0] ? '. One of them is off: check the resting and maximum heart rate, and whether the bests were all-out' : ''}`);
        })()] : []),
        check('level', 'Level ground at a steady effort', 'unknown', 'the equation is for level running: hills, heat and a drifting heart rate lower the estimate'),
      ],
    },
    uth: {
      key: 'uth', group: 'aerobic', depth: 0, name: 'VO2max by Uth’s ratio', method: '15.3 × maximum ÷ resting heart rate (Uth et al. 2004)', tells: 'a population figure, for reference',
      inputs: ['resting heart rate', 'maximum heart rate'], parents: [], where: { tab: 'aerobic', view: 'vo2' }, has: uth !== null,
      checks: [
        restCheck('the ratio follows it directly'), maxCheck('the ratio comes out too low'),
        check('population', 'A population formula fits you', 'doubt', 'fitted to 46 trained men; for one person it is off by about ±5 ml/kg/min, and it knows nothing of your running'),
      ],
    },
    fittedHr: {
      key: 'fittedHr', group: 'response', depth: 0, name: 'Fitted response · VO2max from heart rate', method: 'performance = p0 + k1·fitness − k2·fatigue, fitted to you (Banister 1975; Busso 2003)', tells: 'your own time constants, and when a rest would peak',
      inputs: ['the load of every day', 'VO2max from heart rate of each run'], parents: ['load', 'vo2hr'], where: { tab: 'response' }, ...fittedDef(fitted.hr, 'VO2max from heart rate, a day\'s mean'),
    },
    fittedVdot: {
      key: 'fittedVdot', group: 'response', depth: 0, name: 'Fitted response · VDOT', method: 'the same model, fitted to the weekly VDOT', tells: 'your own time constants, on your bests',
      inputs: ['the load of every day', 'the weekly VDOT'], parents: ['load', 'vdot'], where: { tab: 'response' },
      ...(() => {
        const d = fittedDef(fitted.vdot, 'weekly VDOT');
        return { ...d, checks: [...d.checks, check('smooth', 'The performance moves from week to week', 'doubt', `the VDOT is the best of ${MARKER_DAYS} days: it holds for weeks after a hard effort, so it cannot show fatigue`)] };
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
      const t = worse(trust, resolve(parent).trust);
      if (t !== trust) { trust = t; cappedBy = parent; }
    }
    const report: ModelReport = { ...d, own, trust, cappedBy };
    done.set(key, report);
    return report;
  };
  const order: ModelKey[] = ['load', 'form', 'acwr', 'weekly', 'intensity', 'efforts', 'cs', 'predictions', 'vdot', 'powerEfforts', 'cp', 'ef', 'decoupling', 'vo2hr', 'uth', 'fittedHr', 'fittedVdot'];
  return { now, models: order.map(resolve) };
}
