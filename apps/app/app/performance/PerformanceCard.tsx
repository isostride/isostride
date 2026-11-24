'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { runInWorker, useOpenFolder } from '@/lib/client';
import { PATHS, readJson } from '@/lib/fs';
import type { RunsIndex } from '@/lib/kernel';
import { autoMaxHr, criticalByRun, type LoadSummary } from '@/lib/load';
import { DEFAULT_PERFORMANCE, parsePerformance, readSettings, writeSettings, type PerformanceSettings } from '@/lib/settings';
import { LoadModelChoice } from './LoadModelPicker';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const parsePace = (t: string): number | null | undefined => {
  if (!t.trim()) return null;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
};
const parseNum = (t: string): number | null | undefined => (t.trim() === '' ? null : Number.isFinite(Number(t)) ? Number(t) : undefined);

/**
 * The performance model in Settings › Models (requirement "Load model chosen by the runner"; the
 * runner's "ok wybor modelu chce w settings"): how the load of a run is counted, each choice saying
 * what it needs and how much of it the runs have, and the values the models rest on: the heart rates,
 * the thresholds of rTSS and Power TSS, the time constants of fitness and fatigue, each saying which
 * load model uses it; saved into user/settings.json, saving recomputes every run's load and the
 * context in the Processing Worker.
 */
export function PerformanceCard({ onSaved, onReady }: { onSaved?: () => void; onReady?: () => void } = {}) {
  const { folder, handle } = useOpenFolder();
  const [p, setP] = useState<PerformanceSettings>(DEFAULT_PERFORMANCE);
  const [texts, setTexts] = useState({ restHr: '', maxHr: '', thresholdPace: '', thresholdPower: '', fitnessDays: '', fatigueDays: '' });
  const [auto, setAuto] = useState<{ maxHr: number | null; pace: number | null; power: number | null }>({ maxHr: null, pace: null, power: null });
  /** the runs and their summaries: how much of what each load model needs they have */
  const [have, setHave] = useState<{ runs: RunsIndex['runs']; sums: Record<string, LoadSummary>; cs: number | null; defaultZones: boolean }>({ runs: [], sums: {}, cs: null, defaultZones: true });
  const [status, setStatus] = useState<string | null>(null);
  /** what is saved, to tell a change not saved yet: only then is there a Save */
  const [saved, setSaved] = useState('');
  /** the settings and what "auto" stands for both read: drawn whole only then (layout shift 0) */
  const [read, setRead] = useState({ settings: false, auto: false });
  const ready = read.settings && read.auto;
  useEffect(() => { if (ready) onReady?.(); }, [ready, onReady]);

  useEffect(() => {
    readSettings(folder).then((s) => {
      setHave((h) => ({ ...h, defaultZones: !!s.defaults }));
      const q = s.performance;
      setP(q);
      const t = { restHr: String(q.restHr), maxHr: q.maxHr === null ? '' : String(q.maxHr), thresholdPace: q.thresholdPace === null ? '' : mmss(q.thresholdPace), thresholdPower: q.thresholdPower === null ? '' : String(q.thresholdPower), fitnessDays: String(q.fitnessDays), fatigueDays: String(q.fatigueDays) };
      setTexts(t);
      setSaved(JSON.stringify({ t, load: q.load, sex: q.sex }));
      setRead((r) => ({ ...r, settings: true }));
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
      setHave((h) => ({ ...h, runs: rows, sums, cs: cs ?? null }));
      setRead((r) => ({ ...r, auto: true }));
    })().catch(() => setRead((r) => ({ ...r, auto: true })));
  }, [folder]);

  const values = {
    restHr: parseNum(texts.restHr), maxHr: parseNum(texts.maxHr), thresholdPace: parsePace(texts.thresholdPace), thresholdPower: parseNum(texts.thresholdPower),
    fitnessDays: parseNum(texts.fitnessDays), fatigueDays: parseNum(texts.fatigueDays),
  };
  const bad = (Object.entries(values) as [keyof typeof values, number | null | undefined][]).filter(([k, v]) => v === undefined || ((k === 'restHr' || k === 'fitnessDays' || k === 'fatigueDays') && v === null)).map(([k]) => k);
  // Saved by the runner: the values are theirs from now on (the assumptions' checks read this).
  const next = parsePerformance({ ...p, ...Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)), confirmed: true });
  const edit = (k: keyof typeof texts, v: string) => { setTexts((t) => ({ ...t, [k]: v })); setStatus(null); };

  const now = JSON.stringify({ t: texts, load: p.load, sex: p.sex });
  const dirty = saved !== '' && now !== saved;
  /** The changes not saved left: the values as saved. */
  const discard = () => {
    const s = JSON.parse(saved) as { t: typeof texts; load: PerformanceSettings['load']; sex: PerformanceSettings['sex'] };
    setTexts(s.t);
    setP((q) => ({ ...q, load: s.load, sex: s.sex }));
    setStatus(null);
  };
  const save = async () => {
    if (bad.length) return;
    const s = await readSettings(folder);
    // The zones stay as they are: the defaults are not saved as the runner's own.
    await writeSettings(folder, { schemaVersion: 1, ...(s.defaults ? {} : { zones: s.zones }), performance: next });
    setSaved(now);
    setStatus('Recomputing the loads…');
    await runInWorker('context', handle);
    setStatus('Saved · loads recomputed');
    onSaved?.();
  };

  /** A value: its name and what uses it on the left, its field and unit in one column on the right. */
  const field = (k: keyof typeof texts, label: string, unit: string, uses: string, placeholder?: string) => (
    <label className="form-row">
      <span className="form-row-label"><span>{label}</span><small>{uses}</small></span>
      <span className="form-row-input"><input className="input" aria-label={label} aria-invalid={bad.includes(k)} value={texts[k]} placeholder={placeholder} onChange={(e) => edit(k, e.target.value)} /><span className="muted small">{unit}</span></span>
    </label>
  );
  const inUse = (...models: string[]) => (models.includes(p.load) ? ' · in use' : '');

  if (!ready) return null;
  return (
    <section className="card settings-perf form-card" aria-label="Performance model">
      <div className="form-card-head">
        <div>
          <h2>Performance model</h2>
          <p className="muted small">How the load of a run is counted, and the values the models rest on. The load model changes the views of Load and Response in <Link href="/performance?tab=load">Performance</Link>, marked by its name; Capacity and Aerobic do not depend on it.</p>
        </div>
        <span className="spacer" />
        {status && <span className="muted small" role="status">{status}</span>}
        {dirty && <button className="btn" onClick={discard}>Cancel</button>}
        {dirty && <button className="btn primary" disabled={bad.length > 0} onClick={save}>Save and recompute</button>}
      </div>
      <div className="form-section">
        <h3>Load of a run, counted as</h3>
        <LoadModelChoice value={p.load} onChoose={(load) => { setP((q) => ({ ...q, load })); setStatus(null); }} runs={have.runs} summaries={have.sums} performance={p} defaultZones={have.defaultZones} criticalSpeed={have.cs} />
      </div>
      <div className="form-section">
        <h3>Heart rate</h3>
        <div className="form-rows">
          {field('restHr', 'Resting heart rate', 'bpm', `Banister TRIMP${inUse('trimpBanister')}, VO2max from heart rate`)}
          {field('maxHr', 'Maximum heart rate', 'bpm', `Banister TRIMP${inUse('trimpBanister')}, all-out efforts, VO2max from heart rate · empty: the highest of your runs`, auto.maxHr ? `auto: ${auto.maxHr}` : 'auto')}
          <div className="form-row">
            <span className="form-row-label"><span>Sex</span><small>Banister TRIMP{inUse('trimpBanister')}: its weighting of the heart rate</small></span>
            <div className="form-row-input">
              <div className="segmented" role="radiogroup" aria-label="Sex">
                {(['male', 'female'] as const).map((x) => <button key={x} type="button" role="radio" aria-checked={p.sex === x} className={p.sex === x ? 'on' : ''} onClick={() => { setP((q) => ({ ...q, sex: x })); setStatus(null); }}>{x === 'male' ? 'Male' : 'Female'}</button>)}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="form-section">
        <h3>Thresholds</h3>
        <div className="form-rows">
          {field('thresholdPace', 'Threshold pace', 'min/km', `rTSS${inUse('rtss')} · empty: your critical speed of the 90 days up to each run`, auto.pace ? `auto: ${mmss(auto.pace)}` : 'auto')}
          {field('thresholdPower', 'Critical power', 'W', `Power TSS${inUse('powerTss')} · empty: your critical power of the 90 days up to each run`, auto.power ? `auto: ${Math.round(auto.power)}` : 'auto')}
        </div>
      </div>
      <div className="form-section">
        <h3>Fitness and fatigue</h3>
        <div className="form-rows">
          {field('fitnessDays', 'Fitness (CTL) time constant', 'days', 'Every load model · how slowly fitness follows the load; 42 is usual')}
          {field('fatigueDays', 'Fatigue (ATL) time constant', 'days', 'Every load model · how quickly fatigue follows the load; 7 is usual')}
        </div>
      </div>
    </section>
  );
}
