'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { runInWorker, useLocale, useOpenFolder, watchJob, type JobState } from '@/lib/client';
import { PATHS, listFitFiles, readJson } from '@/lib/fs';
import { dateText, distanceUnit, fromPace, msg, number, paceUnit, t, tn, toPace } from '@/lib/i18n';
import { dayOf, newGearId, readGear, writeGear, type Gear, type GearType } from '@/lib/gear';
import type { RunsIndex } from '@/lib/kernel';
import { autoMaxHr, criticalByRun, summariesCurrent, type LoadSummary } from '@/lib/load';
import { DEFAULT_PERFORMANCE, DEFAULT_ZONES, LOAD_MODELS, zoneMetricsOf, formatBoundaries, invalidPerformance, parseBoundaries, parsePerformance, readSettings, writeSettings, writeSetup, zonesFromMaxHr, zonesFromPace, zonesFromPower, type LoadModel, type PerformanceSettings, type ZoneMetric } from '@/lib/settings';
import { LoadModelChoice } from '../performance/LoadModelPicker';
import { ChartsCard, DisplayCard, LanguageCard } from '../settings/DeviceCards';
import { SetupSteps, useMetrics } from '@/components';
import { minSec } from '@/lib/kernel';

const STEPS = [msg('Your runs'), msg('You'), msg('Zones'), msg('Gear'), msg('Load model'), msg('Look & feel'), msg('Done')] as const;
/** The zones in groups, every metric's shown ("chodzi mi tez o strefy ... np. vertical oscillation, ground contact"). */
const ZONE_GROUPS: [string, string[]][] = [
  [msg('Heart rate and pace'), ['heartRate', 'speed', 'effortPace']],
  [msg('Power'), ['power']],
  [msg('Running form'), ['cadence', 'groundContactTime', 'verticalOscillation', 'stepLength', 'legSpringStiffness']],
  [msg('Other'), ['efficiency', 'altitude']],
];
const num = (t: string): number | null => (t.trim() !== '' && Number.isFinite(Number(t)) ? Number(t) : null);
/** A pace kept in s/km as m:ss in the units chosen (requirement "Units chosen"), and read back from them. */
const mmss = (s: number) => minSec(toPace(s));
const paceOf = (t: string): number | null | undefined => {
  if (!t.trim()) return null;
  const m = t.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  return m ? fromPace(Number(m[1]) * 60 + Number(m[2])) : undefined;
};
const GEAR_NAME: Record<GearType, string> = { shoes: msg('Shoes'), hrSensor: msg('Heart rate strap') };
/** A day of the gear (yyyy-mm-dd), in the language in use, read as a local day. */
const day = (d: string) => dateText(`${d}T00:00`, { day: 'numeric', month: 'short', year: 'numeric' });
/** The model whose name a hint shows, as the load models name it. */
const modelNamed = (key: LoadModel) => t(LOAD_MODELS.find((m) => m.key === key)?.name ?? key);

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
  // Renders again in a language chosen in the Display step, its state kept.
  useLocale();
  // Every metric of the folder's runs (requirement "Every metric offered everywhere"): the known ones
  // in their groups, the others under Other.
  const ZONE_METRICS = zoneMetricsOf(useMetrics().catalog);
  const ALL = ZONE_METRICS.map((m) => m.key);
  const grouped = ZONE_GROUPS.slice(0, -1).flatMap(([, ks]) => ks);
  const groups: [string, string[]][] = [...ZONE_GROUPS.slice(0, -1), [msg('Other'), ALL.filter((k) => !grouped.includes(k))]];
  const { folder, handle } = useOpenFolder();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [have, setHave] = useState<Have | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
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
    let sums = await readJson<{ version?: number; algorithmVersion?: number; runs: Record<string, LoadSummary> }>(folder, PATHS.loadSummaries);
    if (runs.length && !summariesCurrent(sums)) {
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
      const z = Object.fromEntries([...new Set([...ALL, ...Object.keys(s.zones)])].map((k) => [k, formatBoundaries(k, s.zones[k] ?? [])]));
      setZones(z);
      setSavedZones({ texts: z, defaults: !!s.defaults });
    }).catch(() => undefined);
    readGear(folder).then((g) => { setGear(g); setGearSaved(JSON.stringify(g)); }).catch(() => undefined);
    // The runs are imported by themselves (components/AutoImport): their progress shown, the step read again when it ends.
    let was = false;
    return watchJob((j) => {
      const mine = j && j.job === 'import' ? j : null;
      setJob(mine);
      if (mine) was = true;
      else if (was) { was = false; read().catch(() => undefined); }
    });
  }, [folder, read]);

  const rest = num(texts.restHr);
  const max = num(texts.maxHr);
  const NONE = { restHr: null, maxHr: null, thresholdPace: null, thresholdPower: null, fitnessDays: null, fatigueDays: null };
  // The ranges and the pairs the model's card asks too (lib/settings): past them a value was saved as the
  // default without a word (fitness 28 and fatigue 28 as 42 and 7, a maximum under the resting rate as none).
  const badYou = rest === null || (texts.maxHr.trim() !== '' && max === null) || invalidPerformance({ ...NONE, restHr: rest, maxHr: max }).length > 0;
  const parsedZones = Object.fromEntries(ALL.map((k) => [k, (zones[k] ?? '').trim() ? parseBoundaries(k, zones[k]) : []]));
  const badZones = ALL.filter((k) => parsedZones[k] === null);
  const maxForZones = max ?? have?.maxHr ?? null;
  const zonesChanged = ALL.some((k) => (zones[k] ?? '').trim() !== (savedZones.texts[k] ?? '').trim());
  const tPace = paceOf(texts.thresholdPace);
  const tPower = texts.thresholdPower.trim() ? num(texts.thresholdPower) : null;
  const fitness = num(texts.fitnessDays);
  const fatigue = num(texts.fatigueDays);
  const badModel = tPace === undefined || (texts.thresholdPower.trim() !== '' && tPower === null) || fitness === null || fatigue === null || invalidPerformance({ ...NONE, thresholdPace: tPace ?? null, thresholdPower: tPower, fitnessDays: fitness, fatigueDays: fatigue }).length > 0;
  const firstDay = have?.runs.length ? dayOf([...have.runs].sort((a, b) => a.startTime.localeCompare(b.startTime))[0].startTime) : dayOf(new Date().toISOString());
  const addGear = () => {
    if (!newGear.name.trim()) return;
    setGear((g) => [...g, { id: newGearId(), name: newGear.name.trim(), type: newGear.type, from: newGear.from || firstDay, to: null }]);
    setNewGear((n) => ({ ...n, name: '' }));
  };
  const zonesDefault = savedZones.defaults && !zonesChanged;

  const skip = async () => { await writeSetup(folder, 'skipped'); router.push('/dashboard'); };
  const finish = async () => {
    setSaving(t('Saving…'));
    const s = await readSettings(folder);
    // The zones as shown; the defaults left as they were are not saved as the runner's own.
    const z = zonesDefault ? undefined : Object.fromEntries(ALL.map((k) => [k, parsedZones[k] ?? []]));
    await writeSettings(folder, { schemaVersion: 1, ...(z ? { zones: z } : {}), performance: parsePerformance({ ...s.performance, load: p.load, sex: p.sex, restHr: rest ?? s.performance.restHr, maxHr: max, thresholdPace: tPace ?? null, thresholdPower: tPower, fitnessDays: fitness, fatigueDays: fatigue, confirmed: true }) });
    if (JSON.stringify(gear) !== gearSaved) await writeGear(folder, gear);
    if (have?.runs.length) { setSaving(t('Recomputing the loads…')); await runInWorker('context', handle); }
    await writeSetup(folder, 'done');
    router.push('/dashboard');
  };

  const canNext = step === 1 ? !badYou : step === 2 ? badZones.length === 0 : step === 4 ? !badModel : true;
  const count = (ty: GearType) => gear.filter((g) => g.type === ty).length;
  /** What a metric's zones can be filled from: the maximum heart rate, the critical speed or power, the common bands. */
  const paceRef = tPace ?? (have?.cs ? 1000 / have.cs : null);
  const powerRef = tPower ?? have?.cp ?? null;
  const fillFor = (k: string): [string, string, number[]] | null => {
    if (k === 'heartRate' && maxForZones) return [t('From max HR'), t('from your maximum, {max}: {percents} %', { max: number(maxForZones), percents: '60, 70, 80, 90' }), zonesFromMaxHr(maxForZones)];
    if ((k === 'speed' || k === 'effortPace') && paceRef) return [t('From threshold pace'), t('from your threshold pace, {pace} {unit}: {percents} % (Friel)', { pace: mmss(paceRef), unit: paceUnit(), percents: '129, 114, 106, 99' }), zonesFromPace(paceRef)];
    if (k === 'power' && powerRef) return [t('From critical power'), t('from your critical power, {power} W: {percents} % (Stryd)', { power: number(Math.round(powerRef)), percents: '80, 90, 100, 115' }), zonesFromPower(powerRef)];
    if (DEFAULT_ZONES[k]) return [t('Typical'), k === 'cadence' ? t('common cadence bands') : t("the bands of Garmin's running dynamics, from many runners"), DEFAULT_ZONES[k]];
    return null;
  };
  const ZONE_ROW = (m: ZoneMetric) => {
    const fill = fillFor(m.key);
    return (
      <label key={m.key} className="form-row setup-zone">
        <span className="form-row-label"><span>{t('{metric} zones', { metric: t(m.title) })}</span><small>{m.unit ? t(m.unit) : m.unit} · {fill ? fill[1] : t('no common bands: yours, or none')}</small></span>
        <span className="form-row-input">
          <input className="input setup-zone-input" aria-label={t('{metric} zones', { metric: t(m.title) })} aria-invalid={parsedZones[m.key] === null} value={zones[m.key] ?? ''} placeholder={m.pace ? t('e.g. {example}', { example: '6:00, 5:15, 4:45, 4:15' }) : t('none')} onChange={(e) => setZones((z) => ({ ...z, [m.key]: e.target.value }))} />
          {fill && <button type="button" className="btn sm" aria-label={`${fill[0]}: ${t(m.title)}`} onClick={() => setZones((z) => ({ ...z, [m.key]: formatBoundaries(m.key, fill[2]) }))}>{fill[0]}</button>}
        </span>
      </label>
    );
  };
  const modelName = LOAD_MODELS.find((m) => m.key === p.load)?.name;
  // The Done step's sentence around its link to Settings, split where the link goes.
  const doneText = t("Saved into your data folder; everything can be changed later in {settings}. Left there as they are: your tags (made as you tag runs) and the thresholds of the models' checks (their defaults suit most runners).").split('{settings}');

  return (
    <div className="page wide-page setup-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">{t('Set up IsoStride · a few steps, all can be changed later in Settings')}</div>
          <h1>{t('Setup')}</h1>
        </div>
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={skip}>{t('Skip setup')}</button>
      </div>
      {/* The data folder, the first step, is behind: it was chosen to get here. */}
      <SetupSteps at={step + 1} />

      <section className="card setup-card" aria-label={t(STEPS[step])}>
        {step === 0 && (
          <>
            <h2>{t('Your runs')}</h2>
            <p className="muted">{t('IsoStride reads the FIT files your watch saves, in the folder')} <b>{folder.name}</b> {t('or its fit/ subfolder. Nothing leaves this computer.')}</p>
            {!have ? <p className="muted small" role="status">{t('Looking at the folder…')}</p> : (
              <dl className="setup-facts">
                <div><dt>{t('FIT files')}</dt><dd className="tnum">{number(have.fitFiles)}</dd></div>
                <div><dt>{t('Runs imported')}</dt><dd className="tnum">{number(have.runs.length)}</dd></div>
              </dl>
            )}
            {have && have.fitFiles === 0 && <p className="small">{t("No FIT file here yet: copy your watch's FIT files into the folder; they are imported by themselves.")}</p>}
            {have && have.fitFiles > 0 && (
              <div className="setup-actions">
                <span className="muted small" role="status">
                  {job ? t('Importing · {done} / {total} files', { done: number(job.done), total: job.total ? number(job.total) : '…' }) : have.runs.length ? t('Imported: each new file is imported by itself when the app opens or you come back to it.') : t('Importing…')}
                </span>
              </div>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <h2>{t('You')}</h2>
            <p className="muted">{t('Your heart rate makes the load of a run and the heart rate models yours. Left empty, the maximum is the highest your runs reached.')}</p>
            <div className="form-rows setup-rows">
              <label className="form-row">
                <span className="form-row-label"><span>{t('Resting heart rate')}</span><small>{t('Measured lying down on waking; 60 until set')}</small></span>
                <span className="form-row-input"><input className="input" inputMode="numeric" aria-label={t('Resting heart rate')} aria-invalid={rest === null || rest < 25 || rest > 120} value={texts.restHr} onChange={(e) => setTexts((x) => ({ ...x, restHr: e.target.value }))} /><span className="muted small">bpm</span></span>
              </label>
              <label className="form-row">
                <span className="form-row-label"><span>{t('Maximum heart rate')}</span><small>{t('From a test if you know it')}{have?.maxHr ? t('; your runs reached {hr}', { hr: number(have.maxHr) }) : ''}</small></span>
                <span className="form-row-input"><input className="input" inputMode="numeric" aria-label={t('Maximum heart rate')} placeholder={have?.maxHr ? t('auto: {value}', { value: number(have.maxHr) }) : t('auto')} value={texts.maxHr} onChange={(e) => setTexts((x) => ({ ...x, maxHr: e.target.value }))} /><span className="muted small">bpm</span></span>
              </label>
              <div className="form-row">
                <span className="form-row-label"><span>{t('Sex')}</span><small>{t('Banister TRIMP weights the heart rate by it')}</small></span>
                <div className="form-row-input">
                  <div className="segmented" role="radiogroup" aria-label={t('Sex')}>
                    {(['male', 'female'] as const).map((x) => <button key={x} type="button" role="radio" aria-checked={p.sex === x} className={p.sex === x ? 'on' : ''} onClick={() => setP((q) => ({ ...q, sex: x }))}>{x === 'male' ? t('Male') : t('Female')}</button>)}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2>{t('Zones')}</h2>
            <p className="muted">{t('The boundaries between your zones, separated by commas, Z1 the easiest; pace as m:ss per {unit}.', { unit: distanceUnit() })} {savedZones.defaults ? t('These are the defaults, for trying the app: change them to yours.') : t('These are yours, as saved.')} {t("The run chart colours them; the intensity model and Edwards TRIMP read the heart rate's.")}</p>
            {groups.filter(([, keys]) => keys.some((k) => ALL.includes(k))).map(([g, keys]) => (
              <div key={g} className="setup-zone-group" role="group" aria-label={t(g)}>
                <h3>{t(g)}</h3>
                <div className="form-rows setup-rows">
                  {ZONE_METRICS.filter((m) => keys.includes(m.key)).map(ZONE_ROW)}
                </div>
              </div>
            ))}
          </>
        )}

        {step === 3 && (
          <>
            <h2>{t('Gear')}</h2>
            <p className="muted">{t('Your shoes, to compare runs by them, and a heart rate strap if you wear one: the runs in its dates count as measured by a strap, which the models trust more than the wrist.')}</p>
            {gear.length > 0 && (
              <ul className="setup-gear" aria-label={t('Your gear')}>
                {gear.map((g) => (
                  <li key={g.id}>
                    <span className="chip">{t(GEAR_NAME[g.type])}</span>
                    <b>{g.name}</b>
                    <span className="muted small">{g.to ? t('from {from} to {to}', { from: day(g.from), to: day(g.to) }) : t('from {from}', { from: day(g.from) })}</span>
                    <span className="spacer" />
                    <button type="button" className="btn sm" aria-label={t('Remove {name}', { name: g.name })} onClick={() => setGear((all) => all.filter((x) => x.id !== g.id))}>{t('Remove')}</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="setup-gear-add" role="group" aria-label={t('Add gear')}>
              <div className="segmented" role="radiogroup" aria-label={t('Kind of gear')}>
                {(['shoes', 'hrSensor'] as const).map((ty) => <button key={ty} type="button" role="radio" aria-checked={newGear.type === ty} className={newGear.type === ty ? 'on' : ''} onClick={() => setNewGear((n) => ({ ...n, type: ty }))}>{t(GEAR_NAME[ty])}</button>)}
              </div>
              <input className="input" aria-label={t('Name')} placeholder={t('e.g. {example}', { example: newGear.type === 'shoes' ? 'Pegasus 41' : 'HRM-Pro' })} value={newGear.name} onChange={(e) => setNewGear((n) => ({ ...n, name: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') addGear(); }} />
              <input className="input" type="date" aria-label={t('In use from')} value={newGear.from || firstDay} onChange={(e) => setNewGear((n) => ({ ...n, from: e.target.value }))} />
              <button type="button" className="btn" disabled={!newGear.name.trim()} onClick={addGear}>{t('Add')}</button>
            </div>
            <p className="muted small">{t("More (the end of a pair's use, tags for your runs) in Settings › Gears and Tags.")}</p>
          </>
        )}

        {step === 4 && (
          <>
            <h2>{t('Load model')}</h2>
            <p className="muted">{t('How the load of a run is counted. Form, the acute:chronic ratio, the weekly load and the fitted responses follow it; the best efforts and the aerobic models do not.')}</p>
            {have && <LoadModelChoice value={p.load} onChoose={(load: LoadModel) => setP((q) => ({ ...q, load }))} runs={have.runs} summaries={have.summaries} performance={p} defaultZones={zonesDefault} criticalSpeed={have.cs} />}
            <div className="form-rows setup-rows">
              <Row label={t('Threshold pace')} hint={`${modelNamed('rtss')}${p.load === 'rtss' ? ` · ${t('in use')}` : ''} · ${t('empty: your critical speed of the 90 days up to each run')}`}>
                <input className="input" aria-label={t('Threshold pace')} aria-invalid={tPace === undefined} placeholder={have?.cs ? t('auto: {value}', { value: mmss(1000 / have.cs) }) : t('auto')} value={texts.thresholdPace} onChange={(e) => setTexts((x) => ({ ...x, thresholdPace: e.target.value }))} /><span className="muted small">min{paceUnit()}</span>
              </Row>
              <Row label={t('Critical power')} hint={`${modelNamed('powerTss')}${p.load === 'powerTss' ? ` · ${t('in use')}` : ''} · ${t('empty: your critical power of the 90 days up to each run')}`}>
                <input className="input" inputMode="numeric" aria-label={t('Critical power')} placeholder={t('auto')} value={texts.thresholdPower} onChange={(e) => setTexts((x) => ({ ...x, thresholdPower: e.target.value }))} /><span className="muted small">W</span>
              </Row>
            </div>
            <details className="setup-more">
              <summary>{t('Fitness and fatigue · how fast they follow the load')}</summary>
              <div className="form-rows setup-rows">
                <Row label={t('Fitness (CTL) time constant')} hint={t('Every load model; {days} is usual', { days: number(42) })}>
                  <input className="input" inputMode="numeric" aria-label={t('Fitness (CTL) time constant')} value={texts.fitnessDays} onChange={(e) => setTexts((x) => ({ ...x, fitnessDays: e.target.value }))} /><span className="muted small">{t('days')}</span>
                </Row>
                <Row label={t('Fatigue (ATL) time constant')} hint={t('Every load model; {days} is usual', { days: number(7) })}>
                  <input className="input" inputMode="numeric" aria-label={t('Fatigue (ATL) time constant')} value={texts.fatigueDays} onChange={(e) => setTexts((x) => ({ ...x, fatigueDays: e.target.value }))} /><span className="muted small">{t('days')}</span>
                </Row>
              </div>
            </details>
          </>
        )}

        {step === 5 && (
          <>
            <h2>{t('Look & feel')}</h2>
            <p className="muted">{t('How the app and the run chart look on this device; kept in this browser and applied at once.')}</p>
            <div className="setup-device">
              <LanguageCard />
              <DisplayCard />
              <ChartsCard compare={false} />
            </div>
          </>
        )}

        {step === 6 && (
          <>
            <h2>{t('Done')}</h2>
            <p className="muted">{doneText[0]}<Link href="/settings?tab=models">{t('Settings')}</Link>{doneText[1]}</p>
            <dl className="setup-facts setup-summary" aria-label={t('Summary')}>
              <div><dt>{t('Runs')}</dt><dd className="tnum">{number(have?.runs.length ?? 0)}</dd></div>
              <div><dt>{t('Resting heart rate')}</dt><dd className="tnum">{rest === null ? '–' : number(rest)} bpm</dd></div>
              <div><dt>{t('Maximum heart rate')}</dt><dd className="tnum">{max !== null ? number(max) : have?.maxHr ? t('auto: {value}', { value: number(have.maxHr) }) : t('auto')}{max || have?.maxHr ? ' bpm' : ''}</dd></div>
              <div><dt>{t('Heart rate zones')}</dt><dd className="tnum">{zonesDefault ? t('the defaults') : (zones.heartRate ?? '').trim() || t('none')}</dd></div>
              <div><dt>{t('Gear')}</dt><dd>{tn(count('shoes'), '{n} shoes', '{n} shoes')} · {tn(count('hrSensor'), '{n} strap', '{n} straps')}</dd></div>
              <div><dt>{t('Load model')}</dt><dd>{modelName && t(modelName)}</dd></div>
            </dl>
          </>
        )}

        {/* Shown with the first step's content, not before it, so it is not pushed down once the folder is read (layout shift 0). */}
        {(step > 0 || have) && (
          <div className="setup-nav">
            {step > 0 && <button type="button" className="btn" onClick={() => setStep(step - 1)}>{t('Back')}</button>}
            <span className="spacer" />
            {saving && <span className="muted small" role="status">{saving}</span>}
            {!canNext && (step === 1 || step === 4) && <span className="form-error small" role="alert">{t('A value on this step is missing, outside its range or not a number (decimals take a dot, a pace is m:ss); the maximum heart rate must be above the resting one, and fatigue shorter than fitness.')}</span>}
            {step < STEPS.length - 1
              ? <button type="button" className="btn primary" disabled={!canNext || job !== null} onClick={() => setStep(step + 1)}>{t('Next')}</button>
              : <button type="button" className="btn primary" disabled={saving !== null} onClick={finish}>{t('Save and finish')}</button>}
          </div>
        )}
      </section>
    </div>
  );
}
