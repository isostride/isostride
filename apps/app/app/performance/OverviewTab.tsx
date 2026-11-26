'use client';

import { msg, number, t } from '@/lib/i18n';
import type { ModelKey, ModelReport, PerformanceNow } from '@/lib/load';
import { duration as fmtDuration, pace as fmtPace } from '@/lib/format';
import type { Models } from './Assumptions';
import { ModelMap } from './ModelMap';

/** A whole number with its sign: +5, -3, 0 (a rounded -0.3 is 0). */
const signed = (v: number) => `${v > 0 ? '+' : ''}${number(Math.round(v) || 0)}`;
const pct = (v: number) => `${number(Math.round(v * 100))} %`;
const RACE: Record<number, string> = { 5000: '5 km', 10000: '10 km', 21097.5: msg('half'), 42195: msg('marathon') };

/** What a model says now, in a line, in the language in use. */
export function saysNow(key: ModelKey, now: PerformanceNow): string {
  const m = now.marker;
  const fit = (f: PerformanceNow['fitted']['hr']) => (f ? `${t('R² {r2} cross-validated', { r2: number(f.r2cv, 2) })} · τ1 ${number(f.tau1)} d, τ2 ${number(f.tau2)} d` : '–');
  const bests = (e: PerformanceNow['evidence']) => (e.lengths ? t('{n} of {total} all-out', { n: number(e.allOut.length), total: number(e.lengths) }) : '–');
  switch (key) {
    case 'load': return now.week ? t('{load} {unit} this week', { load: number(now.week.load), unit: now.loadUnit }) : '–';
    case 'form': return now.day ? t('fitness {fitness} · fatigue {fatigue} · form {form}', { fitness: number(Math.round(now.day.fitness)), fatigue: number(Math.round(now.day.fatigue)), form: signed(now.day.fitness - now.day.fatigue) }) : '–';
    case 'acwr': return now.day?.acwr != null ? number(now.day.acwr, 2) : '–';
    case 'weekly': return now.week ? t('monotony {monotony} · strain {strain}', { monotony: now.week.monotony == null ? '–' : number(now.week.monotony), strain: now.week.strain == null ? '–' : number(now.week.strain) }) : '–';
    case 'intensity': return now.shares.seconds ? t('{low} low · {moderate} moderate · {high} high', { low: pct(now.shares.low), moderate: pct(now.shares.moderate), high: pct(now.shares.high) }) : '–';
    case 'efforts': return bests(now.evidence);
    case 'powerEfforts': return bests(now.powerEvidence);
    case 'cs': return m?.cs ? `${fmtPace(m.cs)} /km · D′ ${number(Math.round(m.dPrime ?? 0))} m` : '–';
    case 'cp': return m?.cp ? `${number(Math.round(m.cp))} W · W′ ${number((m.wPrime ?? 0) / 1000, 1)} kJ` : '–';
    case 'predictions': return m?.predictions.length ? m.predictions.map((p) => `${t(RACE[p.distance])} ${fmtDuration(Math.round(p.seconds))}`).join(' · ') : '–';
    case 'vdot': return now.vdot !== null ? number(now.vdot) : '–';
    case 'ef': return now.ef !== null ? t('{ef} m per heartbeat', { ef: number(now.ef, 2) }) : '–';
    case 'decoupling': return now.decoupling !== null ? `${number(now.decoupling, 1)} %` : '–';
    case 'vo2hr': return now.vo2hr !== null ? number(now.vo2hr) : '–';
    case 'uth': return now.uth !== null ? number(now.uth) : '–';
    case 'fittedHr': return fit(now.fitted.hr);
    case 'fittedVdot': return fit(now.fitted.vdot);
  }
}

/**
 * The overview of Performance (requirements "Performance structured by evidence", "Model
 * assumptions checked", "Performance kept simple" and "Map of the models"): the map of the models,
 * each with what it says now, its trust and its "Why?". The map is the overview: no list repeats it.
 */
export function OverviewTab({ models, by, now, byLoad }: { models: ModelReport[]; by: Models; now: PerformanceNow; byLoad?: { set: Set<ModelKey>; name: string; unit: string } }) {
  return <ModelMap models={models} by={by} says={(m) => saysNow(m.key, now)} byLoad={byLoad} />;
}
