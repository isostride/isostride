'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { runInWorker, useOpenFolder } from '@/lib/client';
import { PATHS, readJson } from '@/lib/fs';
import { fromPace, paceUnit, t, toPace } from '@/lib/i18n';
import type { RunsIndex } from '@/lib/kernel';
import { autoMaxHr, criticalByRun, type LoadSummary } from '@/lib/load';
import { DEFAULT_PERFORMANCE, PERFORMANCE_RANGES, invalidPerformance, parsePerformance, readSettings, writeSettings, type PerformanceSettings } from '@/lib/settings';
import { CurveModelChoice, LoadModelChoice } from './LoadModelPicker';
import { minSec } from '@/lib/kernel';

/** A pace kept in s/km as m:ss in the units chosen (requirement "Units chosen"), and read back from them. */
const mmss = (s: number) => minSec(toPace(s));
const parsePace = (t: string): number | null | undefined => {
  if (!t.trim()) return null;
  const m = t.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  return m ? fromPace(Number(m[1]) * 60 + Number(m[2])) : undefined;
};
const clockOf = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const range = (k: keyof typeof PERFORMANCE_RANGES) => `${PERFORMANCE_RANGES[k][0]}–${PERFORMANCE_RANGES[k][1]}`;
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
      const typed = { restHr: String(q.restHr), maxHr: q.maxHr === null ? '' : String(q.maxHr), thresholdPace: q.thresholdPace === null ? '' : mmss(q.thresholdPace), thresholdPower: q.thresholdPower === null ? '' : String(q.thresholdPower), fitnessDays: String(q.fitnessDays), fatigueDays: String(q.fatigueDays) };
      setTexts(typed);
      setSaved(JSON.stringify({ t: typed, load: q.load, curve: q.curve, sex: q.sex }));
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
  const unread = (Object.entries(values) as [keyof typeof values, number | null | undefined][]).filter(([k, v]) => v === undefined || ((k === 'restHr' || k === 'fitnessDays' || k === 'fatigueDays') && v === null)).map(([k]) => k);
  // Out of its range, or against another value: said and not saved (it was replaced by the default in silence, the form reading "Saved").
  const outside = invalidPerformance(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v ?? null])) as Parameters<typeof invalidPerformance>[0]);
  const bad = [...new Set([...unread, ...outside])];
  // Saved by the runner: the values are theirs from now on (the assumptions' checks read this).
  const next = parsePerformance({ ...p, ...Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)), confirmed: true });
  const edit = (k: keyof typeof texts, v: string) => { setTexts((x) => ({ ...x, [k]: v })); setStatus(null); };

  const now = JSON.stringify({ t: texts, load: p.load, curve: p.curve, sex: p.sex });
  const dirty = saved !== '' && now !== saved;
  /** The changes not saved left: the values as saved. */
  const discard = () => {
    const s = JSON.parse(saved) as { t: typeof texts; load: PerformanceSettings['load']; curve: PerformanceSettings['curve']; sex: PerformanceSettings['sex'] };
    setTexts(s.t);
    setP((q) => ({ ...q, load: s.load, curve: s.curve, sex: s.sex }));
    setStatus(null);
  };
  const save = async () => {
    if (bad.length) return;
    const s = await readSettings(folder);
    // The zones stay as they are: the defaults are not saved as the runner's own.
    // The thresholds of the checks as they are saved now (the card below saves them): not those read when this card opened.
    await writeSettings(folder, { schemaVersion: 1, ...(s.defaults ? {} : { zones: s.zones }), performance: { ...next, thresholds: s.performance.thresholds } });
    setSaved(now);
    setStatus(t('Recomputing the loads…'));
    await runInWorker('context', handle);
    setStatus(t('Saved · loads recomputed'));
    onSaved?.();
  };

  /** A value: its name and what uses it on the left, its field and unit in one column on the right. */
  const field = (k: keyof typeof texts, label: string, unit: string, uses: string, placeholder?: string) => (
    <label className="form-row">
      <span className="form-row-label"><span>{label}</span><small>{uses}</small></span>
      <span className="form-row-input"><input className="input" aria-label={label} aria-invalid={bad.includes(k)} value={texts[k]} placeholder={placeholder} onChange={(e) => edit(k, e.target.value)} /><span className="muted small">{unit}</span></span>
    </label>
  );
  const inUse = (...models: string[]) => (models.includes(p.load) ? ` · ${t('in use')}` : '');

  if (!ready) return null;
  return (
    <section className="card settings-perf form-card" aria-label={t('Performance model')}>
      <div className="form-card-head">
        <div>
          <h2>{t('Performance model')}</h2>
          <p className="muted small">{t('How the load of a run is counted, and the values the models rest on. The load model changes the views of Load and Response in')} <Link href="/performance?tab=load">{t('Performance')}</Link>{t(', marked by its name; Capacity and Aerobic do not depend on it.')}</p>
        </div>
        <span className="spacer" />
        {status && <span className="muted small" role="status">{status}</span>}
        {dirty && <button className="btn" onClick={discard}>{t('Cancel')}</button>}
        {dirty && <button className="btn primary" disabled={bad.length > 0} onClick={save}>{t('Save and recompute')}</button>}
        {dirty && bad.length > 0 && <span className="form-error small" role="alert">{t('Not saved: the values marked lie outside their range (resting heart rate {restHr} bpm, maximum {maxHr} bpm, threshold pace {pace} {unit}, power {power} W, fitness {fitness} days, fatigue {fatigue} days), or the maximum heart rate is not above the resting one, or fatigue is not shorter than fitness.', { restHr: range('restHr'), maxHr: range('maxHr'), unit: paceUnit(), pace: `${clockOf(Math.round(toPace(PERFORMANCE_RANGES.thresholdPace[0])))}–${clockOf(Math.round(toPace(PERFORMANCE_RANGES.thresholdPace[1])))}`, power: range('thresholdPower'), fitness: range('fitnessDays'), fatigue: range('fatigueDays') })}</span>}
      </div>
      <div className="form-section">
        <h3>{t('Load of a run, counted as')}</h3>
        <LoadModelChoice value={p.load} onChoose={(load) => { setP((q) => ({ ...q, load })); setStatus(null); }} runs={have.runs} summaries={have.sums} performance={p} defaultZones={have.defaultZones} criticalSpeed={have.cs} />
      </div>
      <div className="form-section">
        <h3>{t('Curve of your bests, and the predicted times, by')}</h3>
        <CurveModelChoice value={p.curve} onChoose={(curve) => { setP((q) => ({ ...q, curve })); setStatus(null); }} />
      </div>
      <div className="form-section">
        <h3>{t('Heart rate')}</h3>
        <div className="form-rows">
          {field('restHr', t('Resting heart rate'), 'bpm', t('Banister TRIMP{inUse}, VO2max from heart rate', { inUse: inUse('trimpBanister') }))}
          {field('maxHr', t('Maximum heart rate'), 'bpm', t('Banister TRIMP{inUse}, all-out efforts, VO2max from heart rate · empty: the highest of your runs', { inUse: inUse('trimpBanister') }), auto.maxHr ? t('auto: {value}', { value: auto.maxHr }) : t('auto'))}
          <div className="form-row">
            <span className="form-row-label"><span>{t('Sex')}</span><small>{t('Banister TRIMP{inUse}: its weighting of the heart rate', { inUse: inUse('trimpBanister') })}</small></span>
            <div className="form-row-input">
              <div className="segmented" role="radiogroup" aria-label={t('Sex')}>
                {(['male', 'female'] as const).map((x) => <button key={x} type="button" role="radio" aria-checked={p.sex === x} className={p.sex === x ? 'on' : ''} onClick={() => { setP((q) => ({ ...q, sex: x })); setStatus(null); }}>{x === 'male' ? t('Male') : t('Female')}</button>)}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="form-section">
        <h3>{t('Thresholds')}</h3>
        <div className="form-rows">
          {field('thresholdPace', t('Threshold pace'), `min${paceUnit()}`, `rTSS${inUse('rtss')} · ${t('empty: your critical speed of the 90 days up to each run')}`, auto.pace ? t('auto: {value}', { value: mmss(auto.pace) }) : t('auto'))}
          {field('thresholdPower', t('Critical power'), 'W', `${t('Power TSS')}${inUse('powerTss')} · ${t('empty: your critical power of the 90 days up to each run')}`, auto.power ? t('auto: {value}', { value: Math.round(auto.power) }) : t('auto'))}
        </div>
      </div>
      <div className="form-section">
        <h3>{t('Fitness and fatigue')}</h3>
        <div className="form-rows">
          {field('fitnessDays', t('Fitness (CTL) time constant'), t('days'), t('Every load model · how slowly fitness follows the load; 42 is usual'))}
          {field('fatigueDays', t('Fatigue (ATL) time constant'), t('days'), t('Every load model · how quickly fatigue follows the load; 7 is usual'))}
        </div>
      </div>
    </section>
  );
}
