'use client';

import { useEffect, useState } from 'react';
import { runInWorker, useOpenFolder } from '@/lib/client';
import { PATHS, readJson } from '@/lib/fs';
import type { RunsIndex } from '@/lib/kernel';
import { autoMaxHr, criticalByRun, type LoadSummary } from '@/lib/load';
import { DEFAULT_PERFORMANCE, LOAD_MODELS, parsePerformance, readSettings, writeSettings, type LoadModel, type PerformanceSettings } from '@/lib/settings';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const parsePace = (t: string): number | null | undefined => {
  if (!t.trim()) return null;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
};
const parseNum = (t: string): number | null | undefined => (t.trim() === '' ? null : Number.isFinite(Number(t)) ? Number(t) : undefined);

/**
 * The performance model in Settings (requirement "Load model chosen in Settings"): the load model
 * and its parameters, saved into user/settings.json; saving recomputes every run's load and the
 * context in the Processing Worker.
 */
export function PerformanceCard() {
  const { folder, handle } = useOpenFolder();
  const [p, setP] = useState<PerformanceSettings>(DEFAULT_PERFORMANCE);
  const [texts, setTexts] = useState({ restHr: '', maxHr: '', thresholdPace: '', thresholdPower: '', fitnessDays: '', fatigueDays: '' });
  const [auto, setAuto] = useState<{ maxHr: number | null; pace: number | null; power: number | null }>({ maxHr: null, pace: null, power: null });
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    readSettings(folder).then((s) => {
      const q = s.performance;
      setP(q);
      setTexts({ restHr: String(q.restHr), maxHr: q.maxHr === null ? '' : String(q.maxHr), thresholdPace: q.thresholdPace === null ? '' : mmss(q.thresholdPace), thresholdPower: q.thresholdPower === null ? '' : String(q.thresholdPower), fitnessDays: String(q.fitnessDays), fatigueDays: String(q.fatigueDays) });
    });
    // What "auto" stands for now: the maximum heart rate of the runs, the critical speed and power of the last 90 days.
    (async () => {
      const [index, file] = await Promise.all([readJson<RunsIndex>(folder, PATHS.runsIndex), readJson<{ runs: Record<string, LoadSummary> }>(folder, PATHS.loadSummaries)]);
      const rows = index?.runs ?? [];
      const sums = file?.runs ?? {};
      const last = [...rows].filter((r) => sums[r.id]).sort((a, b) => a.startTime.localeCompare(b.startTime)).pop();
      const cs = last ? criticalByRun(rows, sums, 'speed')[last.id] : null;
      const cp = last ? criticalByRun(rows, sums, 'power')[last.id] : null;
      setAuto({ maxHr: autoMaxHr(Object.values(sums)), pace: cs ? 1000 / cs : null, power: cp ?? null });
    })().catch(() => undefined);
  }, [folder]);

  const values = {
    restHr: parseNum(texts.restHr), maxHr: parseNum(texts.maxHr), thresholdPace: parsePace(texts.thresholdPace), thresholdPower: parseNum(texts.thresholdPower),
    fitnessDays: parseNum(texts.fitnessDays), fatigueDays: parseNum(texts.fatigueDays),
  };
  const bad = (Object.entries(values) as [keyof typeof values, number | null | undefined][]).filter(([k, v]) => v === undefined || ((k === 'restHr' || k === 'fitnessDays' || k === 'fatigueDays') && v === null)).map(([k]) => k);
  const next = parsePerformance({ ...p, ...Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) });
  const edit = (k: keyof typeof texts, v: string) => { setTexts((t) => ({ ...t, [k]: v })); setStatus(null); };
  const choose = (load: LoadModel) => { setP((q) => ({ ...q, load })); setStatus(null); };

  const save = async () => {
    if (bad.length) return;
    const s = await readSettings(folder);
    await writeSettings(folder, { schemaVersion: 1, zones: s.zones, performance: next });
    setStatus('Recomputing the loads…');
    await runInWorker('context', handle);
    setStatus('Saved · loads recomputed');
  };

  const field = (k: keyof typeof texts, label: string, unit: string, placeholder?: string) => (
    <label className="perf-field">
      <span>{label}</span>
      <span className="perf-input"><input className="input" aria-label={label} aria-invalid={bad.includes(k)} value={texts[k]} placeholder={placeholder} onChange={(e) => edit(k, e.target.value)} /><span className="muted">{unit}</span></span>
    </label>
  );

  return (
    <section className="card settings-zones settings-perf" aria-label="Performance model">
      <div className="settings-head">
        <div>
          <h2>Performance model</h2>
          <p className="muted small">How the load of a run is counted, and how fitness and fatigue follow it. The load shows on each run, each week of the calendar and in the context of the segments; the form chart is a tab of Analysis.</p>
        </div>
        <span className="spacer" />
        {status && <span className="muted small" role="status">{status}</span>}
        <button className="btn primary" disabled={bad.length > 0} onClick={save}>Save and recompute</button>
      </div>
      <div className="perf-body">
        <div className="perf-models" role="radiogroup" aria-label="Load model">
          {LOAD_MODELS.map((m) => (
            <button key={m.key} type="button" role="radio" aria-checked={p.load === m.key} className={`perf-model ${p.load === m.key ? 'on' : ''}`} onClick={() => choose(m.key)}>
              <b>{m.name}</b>
              <span className="muted small">{m.about}</span>
            </button>
          ))}
        </div>
        <div className="perf-fields">
          {p.load === 'trimpBanister' && (
            <>
              {field('restHr', 'Resting heart rate', 'bpm')}
              {field('maxHr', 'Maximum heart rate', 'bpm', auto.maxHr ? `auto: ${auto.maxHr}` : 'auto')}
              <div className="perf-field">
                <span>Sex</span>
                <div className="segmented" role="radiogroup" aria-label="Sex">
                  {(['male', 'female'] as const).map((x) => <button key={x} type="button" role="radio" aria-checked={p.sex === x} className={p.sex === x ? 'on' : ''} onClick={() => { setP((q) => ({ ...q, sex: x })); setStatus(null); }}>{x === 'male' ? 'Male' : 'Female'}</button>)}
                </div>
              </div>
            </>
          )}
          {p.load === 'trimpEdwards' && <p className="muted small perf-note">Counts the minutes in each heart rate zone set below, times the zone’s number: Z1 × 1 … Z5 × 5.</p>}
          {p.load === 'rtss' && field('thresholdPace', 'Threshold pace', 'min/km', auto.pace ? `auto: ${mmss(auto.pace)}` : 'auto')}
          {p.load === 'powerTss' && field('thresholdPower', 'Critical power', 'W', auto.power ? `auto: ${Math.round(auto.power)}` : 'auto')}
          {(p.load === 'rtss' || p.load === 'powerTss') && <p className="muted small perf-note">Left empty, each run is measured against the critical {p.load === 'rtss' ? 'speed' : 'power'} of the bests of 2–20 minutes in the 90 days up to it, from the curve of Analysis.</p>}
          {field('fitnessDays', 'Fitness (CTL) time constant', 'days')}
          {field('fatigueDays', 'Fatigue (ATL) time constant', 'days')}
        </div>
      </div>
    </section>
  );
}
