import { ALLOUT_MEAN, ALLOUT_PEAK, HARD_SHARE, MARKER_DAYS, TAU1_RANGE, TAU2_RANGE, type ModelKey } from '@/lib/load';

const pct = (v: number) => `${Math.round(v * 100)} %`;
const CURVE = `A step in the line is a hard effort entering the ${MARKER_DAYS}-day window, or leaving it: the line follows your hardest efforts, not your fitness day by day.`;
const FITTED = `Fitness and fatigue are the loads before each day decayed with the time constants τ1 and τ2, tried from ${TAU1_RANGE[0]} to ${TAU1_RANGE[1]} and from ${TAU2_RANGE[0]} to ${TAU2_RANGE[1]} days, the gains fitted by least squares. R² is the share of the performances' variation the loads explain. The projection is the model run forward with no load: the day it peaks is a guide to the length of a taper.`;

/**
 * How to read each model's figures and chart: shown under its "Why?", not under the chart (the
 * author's request of 21 Nov 2026: "wszystkie dodatkowe informacje powinny byc jako why").
 */
export const READING: Record<ModelKey, string> = {
  load: 'The loads of a day add up; a run without what the model needs is counted from its duration at your median load per minute, and marked with a star.',
  form: 'Fitness and fatigue are averages of the daily load, weighted over the two time constants. Form is fitness minus fatigue of the day before: below zero while training outweighs recovery, above it when you are fresh.',
  acwr: 'The 7-day average of the load over the 28-day one: above 1 the load is rising, below it falling. The shaded band, 0.8–1.3, is a guide to a steady build-up (Gabbett 2016), not a verdict.',
  weekly: 'Monotony is the mean daily load of the week over its standard deviation: above 2 the days vary little. Strain is the week\'s load times its monotony. Ramp rate is the change of fitness over the week: a steady rise of a few points a week is a common guide, sharp rises a warning.',
  intensity: 'Low, moderate and high are Z1–Z2, Z3, and Z4 and above of your zones (Seiler\'s three zones). Endurance athletes spend about 80 % of their training time at low intensity: the mark on the bar, a reference, not a rule.',
  efforts: `Each best is taken for the most you could do for its length. Whether it was is read from the heart rate against your maximum: up to 3 minutes its peak (${pct(ALLOUT_PEAK)} or more is all-out), longer its mean after the first 90 seconds (${pct(ALLOUT_MEAN)} or more), so a stretch half easy and half hard does not pass; from ${pct(HARD_SHARE)} it was hard, though not all-out. Heart rate is evidence, not proof: to make a length count, run it all-out once, on its own.`,
  powerEfforts: 'Read as the best pace, for the stretch of the highest average power of each length.',
  cs: CURVE,
  cp: CURVE,
  predictions: 'The times your bests imply for a runner trained for the distance. The marathon is in the figures only: from efforts of 20 minutes at most it is a rough guess.',
  vdot: 'The VO2max that your predicted 5 km implies by Daniels\' formula: your capacity as one number, comparable with his race tables.',
  ef: 'At the same easy effort, a rising factor means more speed for the same heart rate. Hollow dots are runs that were not easy: a faster run has a higher factor whatever your fitness, so only the easy ones make the trend.',
  decoupling: 'How much the heart rate drifted up against the pace from a run\'s first half to its second. Under 5 % on a steady long run is a sign of aerobic endurance (Friel).',
  vo2hr: 'Each dot is a run long and hard enough; the line is the median of the 28 days up to it. The level moves with your resting and maximum heart rate: the trend is worth more than the level.',
  uth: 'The dashed line on the chart: a reference that knows nothing of your running.',
  fittedHr: FITTED,
  fittedVdot: FITTED,
};
