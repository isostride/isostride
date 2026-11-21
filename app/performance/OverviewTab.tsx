'use client';

import type { ModelKey, ModelReport, PerformanceNow } from '@/lib/load';
import { duration as fmtDuration, pace as fmtPace } from '@/lib/format';
import type { Models } from './Assumptions';
import { ModelMap } from './ModelMap';

const signed = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}`;
const pct = (v: number) => `${Math.round(v * 100)} %`;
const RACE: Record<number, string> = { 5000: '5 km', 10000: '10 km', 21097.5: 'half', 42195: 'marathon' };

/** What a model says now, in a line. */
function saysNow(key: ModelKey, now: PerformanceNow): string {
  const m = now.marker;
  const fit = (f: PerformanceNow['fitted']['hr']) => (f ? `R² ${f.r2.toFixed(2)} · τ1 ${f.tau1} d, τ2 ${f.tau2} d` : '–');
  const bests = (e: PerformanceNow['evidence']) => (e.lengths ? `${e.allOut.length} of ${e.lengths} all-out` : '–');
  switch (key) {
    case 'load': return now.week ? `${now.week.load} ${now.loadUnit} this week` : '–';
    case 'form': return now.day ? `fitness ${Math.round(now.day.fitness)} · fatigue ${Math.round(now.day.fatigue)} · form ${signed(now.day.fitness - now.day.fatigue)}` : '–';
    case 'acwr': return now.day?.acwr != null ? now.day.acwr.toFixed(2) : '–';
    case 'weekly': return now.week ? `monotony ${now.week.monotony ?? '–'} · strain ${now.week.strain ?? '–'}` : '–';
    case 'intensity': return now.shares.seconds ? `${pct(now.shares.low)} low · ${pct(now.shares.moderate)} moderate · ${pct(now.shares.high)} high` : '–';
    case 'efforts': return bests(now.evidence);
    case 'powerEfforts': return bests(now.powerEvidence);
    case 'cs': return m?.cs ? `${fmtPace(m.cs)} /km · D′ ${Math.round(m.dPrime ?? 0)} m` : '–';
    case 'cp': return m?.cp ? `${Math.round(m.cp)} W · W′ ${((m.wPrime ?? 0) / 1000).toFixed(1)} kJ` : '–';
    case 'predictions': return m?.predictions.length ? m.predictions.map((p) => `${RACE[p.distance]} ${fmtDuration(Math.round(p.seconds))}`).join(' · ') : '–';
    case 'vdot': return now.vdot !== null ? String(now.vdot) : '–';
    case 'ef': return now.ef !== null ? `${now.ef.toFixed(2)} m per heartbeat` : '–';
    case 'decoupling': return now.decoupling !== null ? `${now.decoupling.toFixed(1)} %` : '–';
    case 'vo2hr': return now.vo2hr !== null ? String(now.vo2hr) : '–';
    case 'uth': return now.uth !== null ? String(now.uth) : '–';
    case 'fittedHr': return fit(now.fitted.hr);
    case 'fittedVdot': return fit(now.fitted.vdot);
  }
}

/**
 * The overview of Performance (requirements "Performance structured by evidence", "Model
 * assumptions checked", "Performance kept simple" and "Map of the models"): the map of the models,
 * each with what it says now, its trust and its "Why?". The map is the overview: no list repeats it.
 */
export function OverviewTab({ models, by, now }: { models: ModelReport[]; by: Models; now: PerformanceNow }) {
  return <ModelMap models={models} by={by} says={(m) => saysNow(m.key, now)} />;
}
