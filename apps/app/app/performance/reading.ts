import { number, t } from '@/lib/i18n';
import { ALLOUT_MEAN, ALLOUT_PEAK, HARD_SHARE, MARKER_DAYS, TAU1_RANGE, TAU2_RANGE, type ModelKey } from '@/lib/load';

const pct = (v: number) => `${number(Math.round(v * 100))} %`;
const curve = () => t('A step in the line is a hard effort entering the {days}-day window, or leaving it: the line follows your hardest efforts, not your fitness day by day.', { days: MARKER_DAYS });
const fitted = () => t("Fitness and fatigue are the loads before each day decayed with the time constants τ1 and τ2, tried from {tau1From} to {tau1To} and from {tau2From} to {tau2To} days, the gains fitted by least squares. R² is the share of the performances' variation the loads explain. The projection is the model run forward with no load: the day it peaks is a guide to the length of a taper.", {
  tau1From: number(TAU1_RANGE[0]), tau1To: number(TAU1_RANGE[1]), tau2From: number(TAU2_RANGE[0]), tau2To: number(TAU2_RANGE[1]),
});

/**
 * How to read each model's figures and chart: shown under its "Why?", not under the chart (the
 * author's request of 21 Nov 2026: "wszystkie dodatkowe informacje powinny byc jako why"). Each text
 * is read when shown, in the language in use.
 */
export const READING = {
  get load() { return t('The loads of a day add up; a run without what the model needs is counted from its duration at your median load per minute, and marked with a star.'); },
  get form() { return t('Fitness and fatigue are averages of the daily load, weighted over the two time constants. Form is fitness minus fatigue of the day before: below zero while training outweighs recovery, above it when you are fresh.'); },
  get acwr() { return t('The 7-day average of the load over the 28-day one: above 1 the load is rising, below it falling. The shaded band, 0.8–1.3, is a guide to a steady build-up (Gabbett 2016), not a verdict.'); },
  get weekly() { return t("Monotony is the mean daily load of the week over its standard deviation: above 2 the days vary little. Strain is the week's load times its monotony. Ramp rate is the change of fitness over the week: a steady rise of a few points a week is a common guide, sharp rises a warning."); },
  get intensity() { return t("Low, moderate and high are Z1–Z2, Z3, and Z4 and above of your zones (Seiler's three zones). Endurance athletes spend about 80 % of their training time at low intensity: the mark on the bar, a reference, not a rule."); },
  get efforts() {
    return t('Each best is taken for the most you could do for its length. Whether it was is read from the heart rate against your maximum: up to 3 minutes its peak ({peak} or more is all-out), longer its mean after the first 90 seconds ({mean} or more), so an effort half easy and half hard does not pass; from {hard} it was hard, though not all-out. Heart rate is evidence, not proof: to make a length count, run it all-out once, on its own.', {
      peak: pct(ALLOUT_PEAK), mean: pct(ALLOUT_MEAN), hard: pct(HARD_SHARE),
    });
  },
  get powerEfforts() { return t('Read as the best pace, for the effort of the highest average power of each length.'); },
  get cs() { return curve(); },
  get cp() { return curve(); },
  get predictions() { return t('The times your bests imply for a runner trained for the distance. The marathon is in the figures only: from efforts of 20 minutes at most it is a rough guess.'); },
  get vdot() { return t("The VO2max that your predicted 5 km implies by Daniels' formula: your capacity as one number, comparable with his race tables."); },
  get ef() { return t('At the same easy effort, a rising factor means more speed for the same heart rate. Hollow dots are runs that were not easy: a faster run has a higher factor whatever your fitness, so only the easy ones make the trend.'); },
  get decoupling() { return t("How much the heart rate drifted up against the pace from a run's first half to its second. Under 5 % on a steady long run is a sign of aerobic endurance (Friel)."); },
  get vo2hr() { return t('Each dot is a run long and hard enough; the line is the median of the 28 days up to it. The level moves with your resting and maximum heart rate: the trend is worth more than the level.'); },
  get uth() { return t('The dashed line on the chart: a reference that knows nothing of your running.'); },
  get fittedHr() { return fitted(); },
  get fittedVdot() { return fitted(); },
} satisfies Record<ModelKey, string>;
