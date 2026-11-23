'use client';

import type { RunsIndex } from '@/lib/kernel';
import type { LoadSummary } from '@/lib/load';
import { LOAD_MODELS, type LoadModel, type PerformanceSettings } from '@/lib/settings';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

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
  const share = (k: number) => `${k} of ${n} runs`;
  // Before any run there is nothing to say how much of it the runs have: every choice stays open.
  const level = (k: number, all = true) => (!n ? 'ok' : !k ? 'none' : k === n && all ? 'ok' : 'some');
  const p = performance;
  const needs: Record<LoadModel, { text: string; level: 'ok' | 'some' | 'none' }> = {
    trimpBanister: { text: `heart rate: ${share(withHr)} · resting and maximum heart rate`, level: level(withHr) },
    trimpEdwards: { text: `heart rate: ${share(withHr)} · heart rate zones${defaultZones ? ' (the defaults)' : ''}`, level: level(withHr, !defaultZones) },
    rtss: { text: `pace: every run · threshold pace ${p.thresholdPace !== null ? `${mmss(p.thresholdPace)} /km, yours` : criticalSpeed ? `${mmss(1000 / criticalSpeed)} /km from your critical speed` : 'not known yet'}`, level: p.thresholdPace !== null || criticalSpeed ? 'ok' : 'some' },
    powerTss: { text: `power: ${share(withPower)} · critical power${p.thresholdPower !== null ? ` ${p.thresholdPower} W, yours` : ', from your curve'}`, level: level(withPower) },
  };
  return (
    <div className="perf-models load-models" role="radiogroup" aria-label="Load model">
      {LOAD_MODELS.map((m) => {
        const need = needs[m.key];
        return (
          <button key={m.key} type="button" role="radio" aria-checked={value === m.key} disabled={need.level === 'none' && value !== m.key} className={`perf-model ${value === m.key ? 'on' : ''}`} onClick={() => onChoose(m.key)}>
            <b>{m.name}</b>
            <span className="muted small">{m.about}</span>
            <span className={`load-need need-${need.level}`}><i className={`trust-dot ${need.level === 'ok' ? 'ok' : need.level === 'some' ? 'rough' : 'no'}`} aria-hidden="true" />Needs {need.text}</span>
          </button>
        );
      })}
    </div>
  );
}
