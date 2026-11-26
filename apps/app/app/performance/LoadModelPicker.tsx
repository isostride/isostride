'use client';

import { t, tn } from '@/lib/i18n';
import type { RunsIndex } from '@/lib/kernel';
import type { LoadSummary } from '@/lib/load';
import { CURVE_MODELS, LOAD_MODELS, type CurveModel, type LoadModel, type PerformanceSettings } from '@/lib/settings';
import { minSec } from '@/lib/kernel';

const mmss = (s: number) => minSec(s);

/**
 * How the load of a run is counted, chosen in Settings › Models (the runner's "tak" to each choice
 * saying what it needs, then "ok wybor modelu chce w settings"): each choice says what it needs and
 * how much of it the runs have; a choice the runs give nothing for cannot be taken.
 */
export function LoadModelChoice({ value, onChoose, runs, summaries, performance, defaultZones, criticalSpeed }: {
  value: LoadModel;
  onChoose: (m: LoadModel) => void;
  runs: RunsIndex['runs'];
  summaries: Record<string, LoadSummary>;
  performance: PerformanceSettings;
  /** the zones are the defaults, not the runner's */
  defaultZones: boolean;
  /** m/s, of the last 90 days: what rTSS measures a run against unless a threshold pace is set */
  criticalSpeed: number | null;
}) {
  const n = runs.length;
  const withHr = runs.filter((r) => r.avgHeartRate !== null).length;
  const withPower = runs.filter((r) => summaries[r.id]?.normPower != null).length;
  const share = (k: number) => tn(n, '{count} of {n} runs', '{count} of {n} runs', { count: k });
  // Before any run there is nothing to say how much of it the runs have: every choice stays open.
  // i18n-ignore
  const level = (k: number, all = true) => (!n ? 'ok' : !k ? 'none' : k === n && all ? 'ok' : 'some');
  const p = performance;
  const needs: Record<LoadModel, { text: string; level: 'ok' | 'some' | 'none' }> = {
    trimpBanister: { text: t('heart rate: {share} · resting and maximum heart rate', { share: share(withHr) }), level: level(withHr) },
    trimpEdwards: {
      text: defaultZones ? t('heart rate: {share} · heart rate zones (the defaults)', { share: share(withHr) }) : t('heart rate: {share} · heart rate zones', { share: share(withHr) }),
      level: level(withHr, !defaultZones),
    },
    rtss: {
      text: p.thresholdPace !== null
        ? t('pace: every run · threshold pace {pace} /km, yours', { pace: mmss(p.thresholdPace) })
        : criticalSpeed ? t('pace: every run · threshold pace {pace} /km from your critical speed', { pace: mmss(1000 / criticalSpeed) }) : t('pace: every run · threshold pace not known yet'),
      level: p.thresholdPace !== null || criticalSpeed ? 'ok' : 'some',
    },
    powerTss: {
      text: p.thresholdPower !== null ? t('power: {share} · critical power {power} W, yours', { share: share(withPower), power: p.thresholdPower }) : t('power: {share} · critical power, from your curve', { share: share(withPower) }),
      level: level(withPower),
    },
  };
  return (
    <div className="perf-models load-models" role="radiogroup" aria-label={t('Load model')}>
      {LOAD_MODELS.map((m) => {
        const need = needs[m.key];
        return (
          <button key={m.key} type="button" role="radio" aria-checked={value === m.key} disabled={need.level === 'none' && value !== m.key} className={`perf-model ${value === m.key ? 'on' : ''}`} onClick={() => onChoose(m.key)}>
            <b>{t(m.name)}</b>
            <span className="muted small">{t(m.about)}</span>
            <span className={`load-need need-${need.level}`}><i className={`trust-dot ${need.level === 'ok' ? 'ok' : need.level === 'some' ? 'rough' : 'no'}`} aria-hidden="true" />{t('Needs {what}', { what: need.text })}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * How the curve of the bests is modelled, chosen in Settings › Models (the runner's "chce moc wybrac
 * model ... ktory pozniej powinien byc uzywany tu i tu"): the curve drawn, the predicted times, VDOT
 * and the response fitted to it follow the choice.
 */
export function CurveModelChoice({ value, onChoose }: { value: CurveModel; onChoose: (m: CurveModel) => void }) {
  return (
    <div className="perf-models curve-models" role="radiogroup" aria-label={t('Curve model')}>
      {CURVE_MODELS.map((m) => (
        <button key={m.key} type="button" role="radio" aria-checked={value === m.key} className={`perf-model ${value === m.key ? 'on' : ''}`} onClick={() => onChoose(m.key)}>
          <b>{t(m.name)}</b>
          <span className="muted small">{t(m.about)}</span>
        </button>
      ))}
    </div>
  );
}
