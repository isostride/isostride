'use client';

import { CS_RANGE, ENVELOPE_REACH, PT_TMAP, curveOfEstimate, curveOfWhole, estimateCurve, fitWholeCurve, type CurveEstimate, type CurveMetric, type WholeCurve } from '@/lib/curve';
import { number, paceUnit, t } from '@/lib/i18n';
import { pace as fmtPace } from '@/lib/format';
import type { CurveModel } from '@/lib/settings';

/** A length of time as the curve's axis names it: 30 s, 20 min, 2 h. */
const lengthLabel = (d: number) => (d < 60 ? `${number(d)} s` : d < 3600 ? `${number(Math.round(d / 60))} min` : `${number(+(d / 3600).toFixed(1))} h`);

export interface DrawnCurve {
  model: CurveModel;
  /** bests under 2 minutes on the chart, which the critical model and Riegel's law do not describe */
  under: boolean;
  /** the critical model and Riegel's law over 2–20 minutes: critical speed, D′ and the predicted times */
  fit: CurveEstimate | null;
  /** the whole-curve model over every best: Péronnet–Thibault for pace, the omni-domain model for power */
  whole: WholeCurve | null;
  /** what the chart draws: the whole curve, or without it the critical model and Riegel's law past it */
  estimate?: { duration: number; value: number }[];
  extrapolate?: { duration: number; value: number }[];
  at?: (duration: number) => number;
}

/**
 * The curve a chart draws from the bests of every length (a pace in s/km, or a power in W), by the
 * curve model chosen in Settings (the runner's "chce moc wybrac model ... ktory pozniej powinien byc
 * uzywany tu i tu"): the critical model over 2–20 minutes with Riegel's law past them, or the whole
 * curve (the runner's "zrob Peronnet–Thibault albo dla mocy model omni-domain"). Critical speed and D′
 * keep the bests of 2–20 minutes whichever is drawn.
 */
export function drawnCurve(points: { duration: number; value: number }[], metric: CurveMetric, model: CurveModel): DrawnCurve {
  const fit = estimateCurve(points.filter((p) => p.duration >= CS_RANGE[0] && p.duration <= CS_RANGE[1]), metric);
  const whole = model === 'whole' ? fitWholeCurve(points, metric) : null;
  const drawn = model === 'whole' ? (whole ? curveOfWhole(whole) : null) : fit ? curveOfEstimate(fit) : null;
  return { model, under: model === 'riegel' && points.some((p) => p.duration < CS_RANGE[0]), fit, whole, ...(drawn ?? {}) };
}

/** What the dashed and the dotted lines are, with the whole-curve model's parameters. */
export function CurveModelNote({ curve, metric }: { curve: DrawnCurve; metric: CurveMetric }) {
  const w = curve.whole;
  if (curve.model === 'riegel') {
    return (
      <p className="chart-note" data-model="riegel">
        {metric === 'power' ? t('Dashed: the critical power model over 2–20 minutes. Dotted: Riegel’s law past 20 minutes, an extrapolation.') : t('Dashed: the critical speed model over 2–20 minutes, where critical speed and D′ come from. Dotted: Riegel’s law past 20 minutes, an extrapolation; the predicted times come from it.')}
        {curve.under ? <>{' '}{t('Your bests under 2 minutes stand on the chart, but neither model describes that length: no gap to the curve is measured there.')}</> : null}
      </p>
    );
  }
  if (!w) return <p className="chart-note">{t('The model of the whole curve needs bests of 3 minutes or less and of 10 minutes or more.')}</p>;
  const range = { from: lengthLabel(w.range[0]), to: lengthLabel(w.range[1]) };
  const p = w.params;
  return (
    <>
      <p className="chart-note" data-model={w.model}>
        {w.model === 'pt'
          ? t('Dashed: the Péronnet–Thibault model fitted to your bests of {from} to {to}: maximal aerobic speed {mas} {unit}, held for {tmap} minutes, then {decline} % slower for each doubling of the time; an anaerobic reserve of {s} m on top.', { ...range, unit: paceUnit(), mas: fmtPace(p.mas), tmap: number(PT_TMAP / 60), decline: number(Math.max(0, (p.a / p.mas) * Math.LN2 * 100), 1), s: number(Math.round(p.s)) })
            + (w.decline ? '' : ` ${t('No best of 30 minutes or more lies within {reach} % of this curve, so the decline is not yours: it is Riegel’s 1.06, a population figure, and the half and the marathon follow it. Longer bests further below are taken for easy runs; if they were all-out, your endurance is lower and those times are too fast.', { reach: number(ENVELOPE_REACH * 100) })}`)
          : `${t('Dashed: the omni-domain model fitted to your bests of {from} to {to}: critical power {cp} W, W′ {wp} kJ spent no faster than a sprint of {pmax} W allows.', { ...range, cp: number(Math.round(p.cp)), wp: number(p.wp / 1000, 1), pmax: number(Math.round(p.pmax)) })} ${t('Past 30 minutes {decline} W less for each doubling of the time.', { decline: number(Math.round(p.a * Math.LN2)) })}${w.decline ? '' : ` ${t('No best past 30 minutes lies within {reach} % of this curve, so that decline is not yours: it is Riegel’s 1.06, a population figure.', { reach: number(ENVELOPE_REACH * 100) })}`}`}
        {' '}{w.range[1] < 7200 ? t('Dotted: the same model past your longest best, an extrapolation.') : ''}
      </p>
      <p className="chart-note">
        {t('It rests on your strongest bests and lies above the others near it by {error} % on average: no best is faster than it.', { error: number(w.error * 100, 1) })}{' '}
        {w.far.length > 0 && <>{t('Your bests of {lengths} lie far below it: runs not all-out, which do not pull it down.', { lengths: w.far.map(lengthLabel).join(', ') })}{' '}</>}
        {metric === 'power' ? t('Critical power and W′ above keep their own model over 2–20 minutes.') : t('The predicted times come from it; critical speed and D′ keep their own model over 2–20 minutes.')}{' '}

      </p>
    </>
  );
}
