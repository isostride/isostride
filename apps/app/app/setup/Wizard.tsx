'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { runInWorker, useOpenFolder, watchJob, type JobState } from '@/lib/client';
import { PATHS, listFitFiles, readJson } from '@/lib/fs';
import { dayOf, newGearId, readGear, writeGear, type Gear, type GearType } from '@/lib/gear';
import type { RunsIndex } from '@/lib/kernel';
import { LOAD_SUMMARY_VERSION, autoMaxHr, criticalByRun, type LoadSummary } from '@/lib/load';
import { DEFAULT_PERFORMANCE, DEFAULT_ZONES, LOAD_MODELS, ZONE_METRICS, formatBoundaries, parseBoundaries, parsePerformance, readSettings, writeSettings, writeSetup, zonesFromMaxHr, zonesFromPace, zonesFromPower, type LoadModel, type PerformanceSettings } from '@/lib/settings';
import { LoadModelChoice } from '../performance/LoadModelPicker';
import { ChartsCard, DisplayCard } from '../settings/DeviceCards';
import { SetupSteps } from '@/components';

const STEPS = ['Your runs', 'You', 'Zones', 'Gear', 'Load model', 'Display', 'Done'] as const;
/** The zones in groups, every metric's shown ("chodzi mi tez o strefy ... np. vertical oscillation, ground contact"). */
const ZONE_GROUPS: [string, string[]][] = [
  ['Heart rate and pace', ['heartRate', 'speed', 'effortPace']],
  ['Power', ['power']],
  ['Running form', ['cadence', 'groundContactTime', 'verticalOscillation', 'stepLength', 'legSpringStiffness']],
  ['Other', ['efficiency', 'altitude']],
];
const ALL = ZONE_METRICS.map((m) => m.key);
const num = (t: string): number | null => (t.trim() !== '' && Number.isFinite(Number(t)) ? Number(t) : null);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const paceOf = (t: string): number | null | undefined => {
  if (!t.trim()) return null;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
};
const GEAR_NAME: Record<GearType, string> = { shoes: 'Shoes', hrSensor: 'Heart rate strap' };

/** A value of a step: its name and what it is for on the left, its field on the right. */
function Row({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <label className="form-row">
      <span className="form-row-label"><span>{label}</span><small>{hint}</small></span>
      <span className="form-row-input">{children}</span>
    </label>
  );
}

interface Have {
  fitFiles: number;
  runs: RunsIndex['runs'];
  summaries: Record<string, LoadSummary>;
  maxHr: number | null;
  cs: number | null;
  /** W, of the last 90 days */
  cp: number | null;
}

/**
 * The setup wizard (the runner's request of 23 Nov 2026: "chcialbym wizard ... ktory bedzie dostepny
 * z poziomu settings oraz tez bedzie uruchamial sie na poczatku ... ustawienia, wybor modelu, import
 * katalogu itp"; requirement "Setup wizard"): the runs of the folder imported, the runner's heart
 * rates, the zones, the load model, then all saved at once and the loads recomputed. It opens by
 * itself on a folder nothing was set in, and from Settings at any time, filled with what is saved;
 * Skip leaves everything as it is.
 */
export function Wizard() {
  const { folder, handle } = useOpenFolder();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [have, setHave] = useState<Have | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [p, setP] = useState<PerformanceSettings>(DEFAULT_PERFORMANCE);
  const [texts, setTexts] = useState({ restHr: '60', maxHr: '', thresholdPace: '', thresholdPower: '', fitnessDays: '42', fatigueDays: '7' });
  const [gear, setGear] = useState<Gear[]>([]);
  const [gearSaved, setGearSaved] = useState('[]');
  const [newGear, setNewGear] = useState<{ type: GearType; name: string; from: string }>({ type: 'shoes', name: '', from: '' });
  const [zones, setZones] = useState<Record<string, string>>({});
  /** the zones as saved, and whether they are the defaults: unchanged defaults are not saved as the runner's own */
  const [savedZones, setSavedZones] = useState<{ texts: Record<string, string>; defaults: boolean }>({ texts: {}, defaults: true });
  const [saving, setSaving] = useState<string | null>(null);

  /** What the folder holds now: its FIT files, its runs and their summaries (built once when missing). */
  const read = useCallback(async () => {
    const [files, index] = await Promise.all([listFitFiles(folder), readJson<RunsIndex>(folder, PATHS.runsIndex)]);
    const runs = index?.runs ?? [];
    let sums = await readJson<{ version?: number; runs: Record<string, LoadSummary> }>(folder, PATHS.loadSummaries);
    if (runs.length && sums?.version !== LOAD_SUMMARY_VERSION) {
      await runInWorker('context', handle);
      sums = await readJson(folder, PATHS.loadSummaries);
    }
    const summaries = sums?.runs ?? {};
    const last = [...runs].filter((r) => summaries[r.id]).sort((a, b) => a.startTime.localeCompare(b.startTime)).pop();
    setHave({ fitFiles: files.length, runs, summaries, maxHr: autoMaxHr(Object.values(summaries)), cs: last ? criticalByRun(runs, summaries, 'speed')[last.id] ?? null : null, cp: last ? criticalByRun(runs, summaries, 'power')[last.id] ?? null : null });
  }, [folder, handle]);

  useEffect(() => {
    read().catch(() => setHave({ fitFiles: 0, runs: [], summaries: {}, maxHr: null, cs: null, cp: null }));
    // What is saved fills the steps: the wizard opened again from Settings starts from it.
    readSettings(folder).then((s) => {
      setP(s.performance);
      const q = s.performance;
      setTexts({ restHr: String(q.restHr), maxHr: q.maxHr === null ? '' : String(q.maxHr), thresholdPace: q.thresholdPace === null ? '' : mmss(q.thresholdPace), thresholdPower: q.thresholdPower === null ? '' : String(q.thresholdPower), fitnessDays: String(q.fitnessDays), fatigueDays: String(q.fatigueDays) });
      const z = Object.fromEntries(ALL.map((k) => [k, formatBoundaries(k, s.zones[k] ?? [])]));
      setZones(z);
      setSavedZones({ texts: z, defaults: !!s.defaults });
    }).catch(() => undefined);
    readGear(folder).then((g) => { setGear(g); setGearSaved(JSON.stringify(g)); }).catch(() => undefined);
    return watchJob((j) => setJob(j && j.job === 'import' ? j : null));
  }, [folder, read]);

  const importRuns = async () => {
    setMessage(null);
    try {
      const m = await runInWorker('import', handle);
      setMessage(`Imported ${m.imported} run${m.imported === 1 ? '' : 's'}${m.duplicates ? `, ${m.duplicates} duplicate` : ''}${m.errors ? `, ${m.errors} could not be read` : ''}.`);
      await read();
    } catch (e) {
      setMessage(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const rest = num(texts.restHr);
  const max = num(texts.maxHr);
  const badYou = rest === null || rest < 25 || rest > 120 || (texts.maxHr.trim() !== '' && (max === null || max < 100 || max > 240));
  const parsedZones = Object.fromEntries(ALL.map((k) => [k, (zones[k] ?? '').trim() ? parseBoundaries(k, zones[k]) : []]));
  const badZones = ALL.filter((k) => parsedZones[k] === null);
  const maxForZones = max ?? have?.maxHr ?? null;
  const zonesChanged = ALL.some((k) => (zones[k] ?? '').trim() !== (savedZones.texts[k] ?? '').trim());
  const tPace = paceOf(texts.thresholdPace);
  const tPower = texts.thresholdPower.trim() ? num(texts.thresholdPower) : null;
  const fitness = num(texts.fitnessDays);
  const fatigue = num(texts.fatigueDays);
  const badModel = tPace === undefined || (texts.thresholdPower.trim() !== '' && (tPower === null || tPower < 50 || tPower > 800)) || fitness === null || fitness < 7 || fitness > 120 || fatigue === null || fatigue < 2 || fatigue > 30;
  const firstDay = have?.runs.length ? dayOf([...have.runs].sort((a, b) => a.startTime.localeCompare(b.startTime))[0].startTime) : dayOf(new Date().toISOString());
  const addGear = () => {
    if (!newGear.name.trim()) return;
    setGear((g) => [...g, { id: newGearId(), name: newGear.name.trim(), type: newGear.type, from: newGear.from || firstDay, to: null }]);
    setNewGear((n) => ({ ...n, name: '' }));
  };
  const zonesDefault = savedZones.defaults && !zonesChanged;

  const skip = async () => { await writeSetup(folder, 'skipped'); router.push('/dashboard'); };
  const finish = async () => {
    setSaving('Saving…');
    const s = await readSettings(folder);
    // The zones as shown; the defaults left as they were are not saved as the runner's own.
    const z = zonesDefault ? undefined : Object.fromEntries(ALL.map((k) => [k, parsedZones[k] ?? []]));
    await writeSettings(folder, { schemaVersion: 1, ...(z ? { zones: z } : {}), performance: parsePerformance({ ...s.performance, load: p.load, sex: p.sex, restHr: rest ?? s.performance.restHr, maxHr: max, thresholdPace: tPace ?? null, thresholdPower: tPower, fitnessDays: fitness, fatigueDays: fatigue, confirmed: true }) });
    if (JSON.stringify(gear) !== gearSaved) await writeGear(folder, gear);
    if (have?.runs.length) { setSaving('Recomputing the loads…'); await runInWorker('context', handle); }
    await writeSetup(folder, 'done');
    router.push('/dashboard');
  };

  const canNext = step === 1 ? !badYou : step === 2 ? badZones.length === 0 : step === 4 ? !badModel : true;
  const count = (t: GearType) => gear.filter((g) => g.type === t).length;
  /** What a metric's zones can be filled from: the maximum heart rate, the critical speed or power, the common bands. */
  const paceRef = tPace ?? (have?.cs ? 1000 / have.cs : null);
  const powerRef = tPower ?? have?.cp ?? null;
  const fillFor = (k: string): [string, string, number[]] | null => {
    if (k === 'heartRate' && maxForZones) return ['From max HR', `from your maximum, ${maxForZones}: 60, 70, 80, 90 %`, zonesFromMaxHr(maxForZones)];
    if ((k === 'speed' || k === 'effortPace') && paceRef) return ['From threshold pace', `from your threshold pace, ${mmss(paceRef)} /km: 129, 114, 106, 99 % (Friel)`, zonesFromPace(paceRef)];
    if (k === 'power' && powerRef) return ['From critical power', `from your critical power, ${Math.round(powerRef)} W: 80, 90, 100, 115 % (Stryd)`, zonesFromPower(powerRef)];
    if (DEFAULT_ZONES[k]) return ['Typical', k === 'cadence' ? 'common cadence bands' : "the bands of Garmin's running dynamics, from many runners", DEFAULT_ZONES[k]];
    return null;
  };
  const ZONE_ROW = (m: (typeof ZONE_METRICS)[number]) => {
    const fill = fillFor(m.key);
    return (
      <label key={m.key} className="form-row setup-zone">
        <span className="form-row-label"><span>{m.title} zones</span><small>{m.unit}{fill ? ` · ${fill[1]}` : ' · no common bands: yours, or none'}</small></span>
        <span className="form-row-input">
          <input className="input setup-zone-input" aria-label={`${m.title} zones`} aria-invalid={parsedZones[m.key] === null} value={zones[m.key] ?? ''} placeholder={m.pace ? 'e.g. 6:00, 5:15, 4:45, 4:15' : 'none'} onChange={(e) => setZones((z) => ({ ...z, [m.key]: e.target.value }))} />
          {fill && <button type="button" className="btn sm" aria-label={`${fill[0]}: ${m.title}`} onClick={() => setZones((z) => ({ ...z, [m.key]: formatBoundaries(m.key, fill[2]) }))}>{fill[0]}</button>}
        </span>
      </label>
    );
  };
  const modelName = LOAD_MODELS.find((m) => m.key === p.load)?.name;

  return (
    <div className="page wide-page setup-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Set up Isostride · a few steps, all can be changed later in Settings</div>
          <h1>Setup</h1>
        </div>
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={skip}>Skip setup</button>
      </div>
      {/* The data folder, the first step, is behind: it was chosen to get here. */}
      <SetupSteps at={step + 1} />

      <section className="card setup-card" aria-label={STEPS[step]}>
        {step === 0 && (
          <>
            <h2>Your runs</h2>
            <p className="muted">Isostride reads the FIT files your watch saves, in the folder <b>{folder.name}</b> or its fit/ subfolder. Nothing leaves this computer.</p>
            {!have ? <p className="muted small" role="status">Looking at the folder…</p> : (
              <dl className="setup-facts">
                <div><dt>FIT files</dt><dd className="tnum">{have.fitFiles}</dd></div>
                <div><dt>Runs imported</dt><dd className="tnum">{have.runs.length}</dd></div>
              </dl>
            )}
            {have && have.fitFiles === 0 && <p className="small">No FIT file here yet: copy your watch&apos;s FIT files into the folder, then import them here or from the Data folder screen.</p>}
            {have && have.fitFiles > 0 && (
              <div className="setup-actions">
                <button type="button" className="btn primary" disabled={job !== null} onClick={importRuns}>{have.runs.length ? 'Import new files' : `Import ${have.fitFiles} file${have.fitFiles === 1 ? '' : 's'}`}</button>
                {job && <span className="muted small" role="status">Importing · {job.done} / {job.total || '…'} files</span>}
                {!job && message && <span className="small" role="status">{message}</span>}
              </div>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <h2>You</h2>
            <p className="muted">Your heart rate makes the load of a run and the heart rate models yours. Left empty, the maximum is the highest your runs reached.</p>
            <div className="form-rows setup-rows">
              <label className="form-row">
                <span className="form-row-label"><span>Resting heart rate</span><small>Measured lying down on waking; 60 until set</small></span>
                <span className="form-row-input"><input className="input" inputMode="numeric" aria-label="Resting heart rate" aria-invalid={rest === null || rest < 25 || rest > 120} value={texts.restHr} onChange={(e) => setTexts((t) => ({ ...t, restHr: e.target.value }))} /><span className="muted small">bpm</span></span>
              </label>
              <label className="form-row">
                <span className="form-row-label"><span>Maximum heart rate</span><small>From a test if you know it{have?.maxHr ? `; your runs reached ${have.maxHr}` : ''}</small></span>
                <span className="form-row-input"><input className="input" inputMode="numeric" aria-label="Maximum heart rate" placeholder={have?.maxHr ? `auto: ${have.maxHr}` : 'auto'} value={texts.maxHr} onChange={(e) => setTexts((t) => ({ ...t, maxHr: e.target.value }))} /><span className="muted small">bpm</span></span>
              </label>
              <div className="form-row">
                <span className="form-row-label"><span>Sex</span><small>Banister TRIMP weights the heart rate by it</small></span>
                <div className="form-row-input">
                  <div className="segmented" role="radiogroup" aria-label="Sex">
                    {(['male', 'female'] as const).map((x) => <button key={x} type="button" role="radio" aria-checked={p.sex === x} className={p.sex === x ? 'on' : ''} onClick={() => setP((q) => ({ ...q, sex: x }))}>{x === 'male' ? 'Male' : 'Female'}</button>)}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2>Zones</h2>
            <p className="muted">The boundaries between your zones, separated by commas, Z1 the easiest; pace as m:ss per km. {savedZones.defaults ? 'These are the defaults, for trying the app: change them to yours.' : 'These are yours, as saved.'} The run chart colours them; the intensity model and Edwards TRIMP read the heart rate&apos;s.</p>
            {ZONE_GROUPS.map(([g, keys]) => (
              <div key={g} className="setup-zone-group" role="group" aria-label={g}>
                <h3>{g}</h3>
                <div className="form-rows setup-rows">
                  {ZONE_METRICS.filter((m) => keys.includes(m.key)).map(ZONE_ROW)}
                </div>
              </div>
            ))}
          </>
        )}

        {step === 3 && (
          <>
            <h2>Gear</h2>
            <p className="muted">Your shoes, to compare runs by them, and a heart rate strap if you wear one: the runs in its dates count as measured by a strap, which the models trust more than the wrist.</p>
            {gear.length > 0 && (
              <ul className="setup-gear" aria-label="Your gear">
                {gear.map((g) => (
                  <li key={g.id}>
                    <span className="chip">{GEAR_NAME[g.type]}</span>
                    <b>{g.name}</b>
                    <span className="muted small">from {g.from}{g.to ? ` to ${g.to}` : ''}</span>
                    <span className="spacer" />
                    <button type="button" className="btn sm" aria-label={`Remove ${g.name}`} onClick={() => setGear((all) => all.filter((x) => x.id !== g.id))}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="setup-gear-add" role="group" aria-label="Add gear">
              <div className="segmented" role="radiogroup" aria-label="Kind of gear">
                {(['shoes', 'hrSensor'] as const).map((t) => <button key={t} type="button" role="radio" aria-checked={newGear.type === t} className={newGear.type === t ? 'on' : ''} onClick={() => setNewGear((n) => ({ ...n, type: t }))}>{GEAR_NAME[t]}</button>)}
              </div>
              <input className="input" aria-label="Name" placeholder={newGear.type === 'shoes' ? 'e.g. Pegasus 41' : 'e.g. HRM-Pro'} value={newGear.name} onChange={(e) => setNewGear((n) => ({ ...n, name: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') addGear(); }} />
              <input className="input" type="date" aria-label="In use from" value={newGear.from || firstDay} onChange={(e) => setNewGear((n) => ({ ...n, from: e.target.value }))} />
              <button type="button" className="btn" disabled={!newGear.name.trim()} onClick={addGear}>Add</button>
            </div>
            <p className="muted small">More (the end of a pair&apos;s use, tags for your runs) in Settings › Gear and Tags.</p>
          </>
        )}

        {step === 4 && (
          <>
            <h2>Load model</h2>
            <p className="muted">How the load of a run is counted. Form, the acute:chronic ratio, the weekly load and the fitted responses follow it; the best efforts and the aerobic models do not.</p>
            {have && <LoadModelChoice value={p.load} onChoose={(load: LoadModel) => setP((q) => ({ ...q, load }))} runs={have.runs} summaries={have.summaries} performance={p} defaultZones={zonesDefault} criticalSpeed={have.cs} />}
            <div className="form-rows setup-rows">
              <Row label="Threshold pace" hint={`rTSS${p.load === 'rtss' ? ' · in use' : ''} · empty: your critical speed of the 90 days up to each run`}>
                <input className="input" aria-label="Threshold pace" aria-invalid={tPace === undefined} placeholder={have?.cs ? `auto: ${mmss(1000 / have.cs)}` : 'auto'} value={texts.thresholdPace} onChange={(e) => setTexts((t) => ({ ...t, thresholdPace: e.target.value }))} /><span className="muted small">min/km</span>
              </Row>
              <Row label="Critical power" hint={`Power TSS${p.load === 'powerTss' ? ' · in use' : ''} · empty: your critical power of the 90 days up to each run`}>
                <input className="input" inputMode="numeric" aria-label="Critical power" placeholder="auto" value={texts.thresholdPower} onChange={(e) => setTexts((t) => ({ ...t, thresholdPower: e.target.value }))} /><span className="muted small">W</span>
              </Row>
            </div>
            <details className="setup-more">
              <summary>Fitness and fatigue · how fast they follow the load</summary>
              <div className="form-rows setup-rows">
                <Row label="Fitness (CTL) time constant" hint="Every load model; 42 is usual">
                  <input className="input" inputMode="numeric" aria-label="Fitness (CTL) time constant" value={texts.fitnessDays} onChange={(e) => setTexts((t) => ({ ...t, fitnessDays: e.target.value }))} /><span className="muted small">days</span>
                </Row>
                <Row label="Fatigue (ATL) time constant" hint="Every load model; 7 is usual">
                  <input className="input" inputMode="numeric" aria-label="Fatigue (ATL) time constant" value={texts.fatigueDays} onChange={(e) => setTexts((t) => ({ ...t, fatigueDays: e.target.value }))} /><span className="muted small">days</span>
                </Row>
              </div>
            </details>
          </>
        )}

        {step === 5 && (
          <>
            <h2>Display</h2>
            <p className="muted">How the app and the run chart look on this device; kept in this browser and applied at once.</p>
            <div className="setup-device">
              <DisplayCard />
              <ChartsCard />
            </div>
          </>
        )}

        {step === 6 && (
          <>
            <h2>Done</h2>
            <p className="muted">Saved into your data folder; everything can be changed later in <Link href="/settings?tab=models">Settings</Link>. Left there as they are: your tags (made as you tag runs) and the thresholds of the models&apos; checks (their defaults suit most runners).</p>
            <dl className="setup-facts setup-summary" aria-label="Summary">
              <div><dt>Runs</dt><dd className="tnum">{have?.runs.length ?? 0}</dd></div>
              <div><dt>Resting heart rate</dt><dd className="tnum">{rest ?? '–'} bpm</dd></div>
              <div><dt>Maximum heart rate</dt><dd className="tnum">{max ?? (have?.maxHr ? `auto: ${have.maxHr}` : 'auto')}{max || have?.maxHr ? ' bpm' : ''}</dd></div>
              <div><dt>Heart rate zones</dt><dd className="tnum">{zonesDefault ? 'the defaults' : (zones.heartRate ?? '').trim() || 'none'}</dd></div>
              <div><dt>Gear</dt><dd>{count('shoes')} shoes · {count('hrSensor')} strap{count('hrSensor') === 1 ? '' : 's'}</dd></div>
              <div><dt>Load model</dt><dd>{modelName}</dd></div>
            </dl>
          </>
        )}

        <div className="setup-nav">
          {step > 0 && <button type="button" className="btn" onClick={() => setStep(step - 1)}>Back</button>}
          <span className="spacer" />
          {saving && <span className="muted small" role="status">{saving}</span>}
          {step < STEPS.length - 1
            ? <button type="button" className="btn primary" disabled={!canNext || job !== null} onClick={() => setStep(step + 1)}>Next</button>
            : <button type="button" className="btn primary" disabled={saving !== null} onClick={finish}>Save and finish</button>}
        </div>
      </section>
    </div>
  );
}
