'use client';

import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useMetrics } from '@/components';
import { PERIOD_PRESETS, REFERENCE_SHAPES, patternKey, patternName, repsName, type LayoutFilter, RULE_TOLERANCES, SHOWN_WORDS, STATS, STAT_LABEL, STRETCH_PRESETS, lengthName, presetDates, ruleName, ruleOf, shownName, type BlockDefinition, type BlockInstance, type BlockStart, type Conditions, type PeriodPreset, type Pick, type Rule, type RuleShape, type RunFilter, type Stat, type Tolerances, shapeName } from '@/lib/blocks';
import { instancesInWorker, useLocale } from '@/lib/client';
import { date, pace as fmtPace } from '@/lib/format';
import { msg, number, t, tn } from '@/lib/i18n';
import type { FoundLayout } from './options';

export interface BuilderOptions {
  workoutTypes: string[];
  techniqueCues: string[];
  shoes: string[];
  heartRateSources: string[];
  devices: string[];
  /** the layouts of laps the runs follow (requirement "Segments by lap layout") */
  layouts: FoundLayout[];
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const parsePace = (text: string): number | null => {
  if (!text.trim()) return null;
  const [m, s] = text.split(':').map(Number);
  return Number.isFinite(m) ? m * 60 + (s || 0) : null;
};
const parseNum = (text: string, scale = 1): number | null => {
  if (!text.trim()) return null;
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) ? n * scale : null;
};
const PRESET_LABEL: Record<PeriodPreset, string> = { all: msg('All runs'), month: msg('Last 30 days'), quarter: msg('Last 3 months'), year: msg('This year') };
const PICKS: [Pick, string][] = [['best', msg('The fastest one')], ['all', msg('Every one')]];
/** A preset length as its pill shows it: "5 min", "10 km". */
const stretchLabel = (w: { kind: 'time' | 'distance'; target: number }) => lengthName(w.kind, w.target, SHOWN_WORDS);
/** A number as a field shows it, in the language in use; read back with a comma or a point. */
const num = (v: number) => number(v);

/** A pair of inputs for one range; the value is kept in the rule's unit. */
function Range({ label, names, unit, from, to, show, parse, onChange }: {
  label: string; names: [string, string]; unit: string; from: number | null; to: number | null;
  show: (v: number) => string; parse: (text: string) => number | null; onChange: (from: number | null, to: number | null) => void;
}) {
  return (
    <div className="field">
      <span>{label}</span>
      <span className="range">
        <input aria-label={names[0]} placeholder={t('from')} defaultValue={from === null ? '' : show(from)} onChange={(e) => onChange(parse(e.target.value), to)} />
        <span className="muted">–</span>
        <input aria-label={names[1]} placeholder={t('to')} defaultValue={to === null ? '' : show(to)} onChange={(e) => onChange(from, parse(e.target.value))} />
        <span className="muted small unit">{unit}</span>
      </span>
    </div>
  );
}

/** Pills toggling the values of a list; none chosen means any. */
function Picks({ label, options, chosen, onChange }: { label: string; options: string[]; chosen: string[]; onChange: (v: string[]) => void }) {
  if (!options.length) return null;
  return (
    <div className="field picks">
      <span>{label}</span>
      <span className="metric-picker" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o} type="button" className={`pill ${chosen.includes(o) ? 'on' : ''}`} aria-pressed={chosen.includes(o)} onClick={() => onChange(chosen.includes(o) ? chosen.filter((x) => x !== o) : [...chosen, o])}>{o}</button>
        ))}
      </span>
    </div>
  );
}

/**
 * A layout of laps chosen from those the runs follow, and how a run follows it: the same laps
 * (identical) or the same reps in any layout (similar).
 */
function LayoutField({ label, value, layouts, any, onChange }: { label: string; value: LayoutFilter | null; layouts: FoundLayout[]; any?: boolean; onChange: (v: LayoutFilter | null) => void }) {
  const key = value ? patternKey(value.laps) : '';
  // The layout of a segment kept from before stays offered, though no run follows it now.
  const listed = value && !layouts.some((l) => patternKey(l.laps) === key) ? [{ laps: value.laps, runs: 0, similar: 0 }, ...layouts] : layouts;
  const chosen = listed.find((l) => patternKey(l.laps) === key);
  const runsOf = (n: number) => tn(n, '{n} run', '{n} runs');
  return (
    <>
      <label className="field">
        <span>{label}</span>
        <select className="select small" aria-label={label} value={key} onChange={(e) => { const l = listed.find((x) => patternKey(x.laps) === e.target.value); onChange(l ? { laps: l.laps, match: value?.match ?? 'identical' } : null); }}>
          {any && <option value="">{t('Any layout')}</option>}
          {listed.map((l) => <option key={patternKey(l.laps)} value={patternKey(l.laps)}>{l.runs ? `${patternName(l.laps, SHOWN_WORDS)} (${runsOf(l.runs)})` : patternName(l.laps, SHOWN_WORDS)}</option>)}
        </select>
      </label>
      {value && (
        <div className="field">
          <span>{t('Runs that follow it')}</span>
          <div className="segmented" role="radiogroup" aria-label={t('{label}: runs that follow it', { label })}>
            {([['identical', t('Identical layout')], ['similar', t('The same reps: {reps}', { reps: repsName(value.laps, SHOWN_WORDS) })]] as const).map(([m, l]) => {
              const n = chosen?.runs ? (m === 'identical' ? chosen.runs : chosen.similar) : null;
              const on = (value.match ?? 'identical') === m;
              return <button key={m} type="button" role="radio" aria-checked={on} className={on ? 'on' : ''} title={m === 'identical' ? t('The same laps from the warm-up to the cool-down') : t('As many reps, as long; any warm-up, recoveries and cool-down')} onClick={() => onChange({ ...value, match: m })}>{l}{n !== null && <span className="muted"> · {runsOf(n)}</span>}</button>;
            })}
          </div>
        </div>
      )}
    </>
  );
}

/** A field that is set or was added, with × to remove it (and clear what it set). */
function Opt({ label, onRemove, children }: { label: string; onRemove: () => void; children: ReactNode }) {
  return (
    <div className="opt-field">
      <div className="opt-body">{children}</div>
      <button type="button" className="field-remove" aria-label={t('Remove {name}', { name: label })} title={t('Remove {name}', { name: label })} onClick={onRemove}>×</button>
    </div>
  );
}

/** "+ Add …": the fields not shown yet. */
function AddField({ label, groups, onAdd }: { label: string; groups: [string, [string, string][]][]; onAdd: (key: string) => void }) {
  const offered = groups.filter(([, o]) => o.length);
  if (!offered.length) return null;
  return (
    <select className="select small add-field" aria-label={label} value="" onChange={(e) => e.target.value && onAdd(e.target.value)}>
      <option value="">{label}</option>
      {offered.map(([g, o]) => <optgroup key={g} label={g}>{o.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</optgroup>)}
    </select>
  );
}

export interface BuilderState {
  rule: Rule;
  name: string;
  /** segments the rule selects now; null while they are counted */
  segments: number | null;
  /** the last step is shown: the place of Save */
  last: boolean;
  /** Back and Next, for the editor's actions */
  nav: ReactNode;
}

/**
 * The block builder (requirement "Blocks defined in Analysis"): the shape of a segment, the
 * runs it is looked for in, what it must meet on average and at every moment, how many per run
 * and the statistic; the segments the rule selects are counted and listed as it changes.
 */
export function RuleBuilder({ initial, initialName, options, handle, footer, tolerances = RULE_TOLERANCES, children }: {
  initial?: Rule; initialName?: string; options: BuilderOptions; handle: FileSystemDirectoryHandle;
  footer: (s: BuilderState) => ReactNode;
  /** the matching checks the segments are counted with */
  tolerances?: Tolerances;
  /** more of the form, after the rule (the matching checks) */
  children?: ReactNode;
}) {
  // The builder follows a change of the language.
  useLocale();
  const [rule, setRule] = useState<Rule>(initial ?? ruleOf({ type: 'fastest', kind: 'time', target: 300 }));
  /** the stretch taken from a run (a route, a profile, a lap layout, the main effort): offered beside the others */
  const [reference] = useState(() => (initial && (REFERENCE_SHAPES as readonly string[]).includes(initial.shape.type) ? initial.shape : null));
  /** the length of the laps a workout set up, from the block as it opened */
  const [planned] = useState(() => (initial?.shape.type === 'lap' ? initial.shape.planned ?? null : null));
  // The name as kept: one the app made stays in English in the data folder and shows in the language in use.
  const [name, setName] = useState(initialName ?? '');
  const [named, setNamed] = useState(!!initialName && initialName !== (initial ? ruleName(initial) : ''));
  /** true once the runner typed in the name */
  const [typed, setTyped] = useState(false);
  const [preset, setPreset] = useState<PeriodPreset | null>(rule.runs.dateFrom === null && rule.runs.dateTo === null ? 'all' : null);
  const [found, setFound] = useState<BlockInstance[] | null>(null);
  const uid = useId();
  /** the step shown (requirement "Segment editor as a wizard") */
  const [step, setStep] = useState(0);
  /** the filters and conditions added, shown though nothing is set in them yet */
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const runs = (p: Partial<RunFilter>) => setRule((r) => ({ ...r, runs: { ...r.runs, ...p } }));
  const cond = (p: Partial<Conditions>) => setRule((r) => ({ ...r, conditions: { ...r.conditions, ...p } }));
  // Any other metric of the folder's runs, on average within a range (requirement "Every metric offered everywhere").
  const known = useMetrics();
  const otherMetrics = known.blockKeys.filter((k) => k !== 'speed' && k !== 'heartRate');
  const chosenMetric = rule.conditions.metric ? known.view(rule.conditions.metric) : null;
  /** The segment when the laps are not split (step 3): the block's own when it had one, else the whole run. */
  const [segmentShape, setSegmentShape] = useState<RuleShape>(() => (rule.shape.type !== 'lap' && rule.shape.type !== 'pattern' ? rule.shape : { type: 'run' }));
  /** Sets the segment, the pick that fits it with it. */
  const setShapeTo = (shape: RuleShape, runsPatch: Partial<RunFilter> = {}) => setRule((r) => ({ ...r, shape, runs: { ...r.runs, ...runsPatch }, pick: shape.type === 'fastest' ? 'best' : r.shape.type === shape.type ? r.pick : 'all' }));
  const shownNameText = named ? (typed || !initial ? name : shownName(name, initial)) : ruleName(rule, SHOWN_WORDS);
  const effectiveName = named ? name : ruleName(rule);
  const code = useMemo(() => JSON.stringify(rule), [rule]);
  // The checks count by their values only.
  const tolKey = JSON.stringify(tolerances);

  // The segments the rule selects, counted in the worker a moment after the last change.
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setFound(null);
    setError(null);
    // i18n-ignore: the preview's id and name, never shown
    const def: BlockDefinition = { id: 'preview', name: 'preview', origin: 'manual', status: 'active', createdAt: '', params: { type: 'rule', ...(JSON.parse(code) as Rule) }, tolerances: JSON.parse(tolKey) as Tolerances };
    const timer = setTimeout(() => {
      instancesInWorker([def], handle, undefined, controller.signal)
        .then((r) => live && setFound(r.preview ?? []))
        .catch((e) => live && (e as Error).name !== 'AbortError' && setError(e instanceof Error ? e.message : String(e)));
    }, 350);
    return () => { live = false; clearTimeout(timer); controller.abort(); };
  }, [code, handle, tolKey]);

  const accepted = found?.filter((i) => i.status === 'accepted') ?? [];
  const leftOut = (found?.length ?? 0) - accepted.length;
  const inRuns = new Set(accepted.map((i) => i.runId)).size;
  const c = rule.conditions;
  const f = rule.runs;
  const shape = rule.shape;

  // Step 2, the run's layout (requirement "Segment editor as a wizard"): any layout or one found in the runs, and
  // whether the segments are its laps or its reps; the layout the reps' own, else a filter of the runs.
  const split: 'none' | 'laps' | 'reps' = shape.type === 'pattern' ? 'reps' : shape.type === 'lap' ? 'laps' : 'none';
  const layout: LayoutFilter | null = shape.type === 'pattern' ? { laps: shape.laps, match: shape.match ?? 'identical' } : f.layout ?? null;
  const setLayout = (v: LayoutFilter | null) => {
    if (split === 'reps') { if (v) setShapeTo({ type: 'pattern', laps: v.laps, tolerance: 0.03, match: v.match }); else setShapeTo(segmentShape); return; }
    runs({ layout: v ?? undefined });
  };
  const setSplit = (k: 'none' | 'laps' | 'reps') => {
    if (k === split) return;
    if (k === 'reps') { const l = layout ?? (options.layouts[0] ? { laps: options.layouts[0].laps, match: 'identical' as const } : null); if (l) setShapeTo({ type: 'pattern', laps: l.laps, tolerance: 0.03, match: l.match }, { layout: undefined }); return; }
    if (k === 'laps') { setShapeTo(planned ? { type: 'lap', planned } : { type: 'lap' }, { layout: layout ?? undefined }); return; }
    setShapeTo(segmentShape, { layout: layout ?? undefined });
  };
  // Step 3, the segment of each run when the laps are not split: the whole run, the fastest time or distance (or what the block was taken as).
  const chooseSegment = (s2: RuleShape) => { setSegmentShape(s2); setShapeTo(s2); };
  const SEGMENTS: [string, string, RuleShape][] = [
    ...(reference && reference.type !== 'pattern' ? [['ref', shapeName(reference), reference] as [string, string, RuleShape]] : []),
    ['run', t('Whole run'), { type: 'run' }],
    ['time', t('Time'), shape.type === 'fastest' && shape.kind === 'time' ? shape : { type: 'fastest', kind: 'time', target: 300 }],
    ['distance', t('Distance'), shape.type === 'fastest' && shape.kind === 'distance' ? shape : { type: 'fastest', kind: 'distance', target: 5000 }],
    // An older steady segment shows its shape while it is one ("roznica jest tylko taka ... czy to ma byc czas czy dystans").
    ...(shape.type === 'steady' ? [['steady', t('Steady effort'), shape] as [string, string, RuleShape]] : []),
  ];
  const segmentKey = shape.type === 'fastest' ? shape.kind : shape.type === 'run' ? 'run' : shape.type === 'steady' ? 'steady' : 'ref';

  // Step 4, the further conditions: of the run (its tags, shoes, title, devices) and of the segment (its pace, heart rate, …),
  // shown when set or added, the others offered by "+ Add a condition".
  const runFields: { key: string; label: string; set: boolean; offered: boolean; clear: Partial<RunFilter> }[] = [
    { key: 'workoutTypes', label: t('Workout type'), set: f.workoutTypes.length > 0, offered: options.workoutTypes.length > 0, clear: { workoutTypes: [] } },
    { key: 'techniqueCues', label: t('Technique cue'), set: f.techniqueCues.length > 0, offered: options.techniqueCues.length > 0, clear: { techniqueCues: [] } },
    { key: 'shoes', label: t('Shoes'), set: f.shoes.length > 0, offered: options.shoes.length > 0, clear: { shoes: [] } },
    { key: 'title', label: t('Title contains'), set: f.title.trim() !== '', offered: true, clear: { title: '' } },
    { key: 'heartRateSources', label: t('Heart rate from'), set: f.heartRateSources.length > 0, offered: options.heartRateSources.length > 0, clear: { heartRateSources: [] } },
    { key: 'devices', label: t('Watch'), set: f.devices.length > 0, offered: options.devices.length > 0, clear: { devices: [] } },
    // The number of laps no longer offered (the layout is step 2's); an older segment's shows, to be removed.
    { key: 'laps', label: t('Laps in the run'), set: f.lapsMin !== null || f.lapsMax !== null, offered: false, clear: { lapsMin: null, lapsMax: null } },
  ];
  const condFields: { key: string; label: string; set: boolean; offered: boolean; clear: Partial<Conditions> }[] = [
    { key: 'pace', label: t('Pace'), set: c.paceMin !== null || c.paceMax !== null, offered: true, clear: { paceMin: null, paceMax: null } },
    { key: 'hr', label: t('Heart rate'), set: c.hrMin !== null || c.hrMax !== null, offered: true, clear: { hrMin: null, hrMax: null } },
    { key: 'metric', label: t('Another metric'), set: !!c.metric, offered: otherMetrics.length > 0, clear: { metric: null, metricMin: null, metricMax: null } },
    { key: 'distance', label: t('Distance'), set: c.distanceMin !== null || c.distanceMax !== null, offered: shape.type !== 'fastest', clear: { distanceMin: null, distanceMax: null } },
    { key: 'duration', label: t('Duration'), set: c.durationMin !== null || c.durationMax !== null, offered: shape.type !== 'fastest', clear: { durationMin: null, durationMax: null } },
    { key: 'alwaysHr', label: t('Heart rate never below / above'), set: c.alwaysHrMin !== null || c.alwaysHrMax !== null, offered: true, clear: { alwaysHrMin: null, alwaysHrMax: null } },
    { key: 'alwaysPace', label: t('Pace always within'), set: c.alwaysPaceMin !== null || c.alwaysPaceMax !== null, offered: true, clear: { alwaysPaceMin: null, alwaysPaceMax: null } },
    { key: 'start', label: t('Start of the effort'), set: c.start !== 'any', offered: shape.type !== 'run', clear: { start: 'any' } },
  ];
  const all = [...runFields, ...condFields];
  const shown = (k: string) => { const x = all.find((y) => y.key === k)!; return x.set || (x.offered && added.includes(k)); };
  const remove = (k: string) => {
    const r = runFields.find((x) => x.key === k);
    if (r) runs(r.clear); else cond(condFields.find((x) => x.key === k)!.clear);
    setAdded((a) => a.filter((x) => x !== k));
  };
  const periodText = preset ? t(PRESET_LABEL[preset]) : f.dateFrom && f.dateTo ? `${date(f.dateFrom)} – ${date(f.dateTo)}` : f.dateFrom ? t('since {date}', { date: date(f.dateFrom) }) : f.dateTo ? t('to {value}', { value: date(f.dateTo) }) : t('All runs');
  const splitLabel = split === 'reps' ? t('The reps') : split === 'laps' ? t('Each lap') : null;
  const layoutSummary = [layout ? `${patternName(layout.laps, SHOWN_WORDS)}${layout.match === 'similar' ? ` · ${t('the same reps')}` : ''}` : t('Any layout'), splitLabel].filter(Boolean).join(' · ');
  const segmentSummary = [split === 'none' ? shapeName(shape, SHOWN_WORDS) : splitLabel, shape.type !== 'run' && rule.pick !== (shape.type === 'fastest' ? 'best' : 'all') ? t(PICKS.find(([k]) => k === rule.pick)![1]) : null, rule.stat !== 'avg' ? t(STAT_LABEL[rule.stat]) : null].filter(Boolean).join(' · ');
  const condSummary = all.filter((x) => x.set).map((x) => x.label).join(' · ') || t('none');

  const STEPS = [
    // The period, the run's layout, the segment of each run, further conditions, the name ("chce 1. Okres ... 2. Schemat biegu ... 3. Segment ... 4. dodaktowe warunki").
    { title: t('Period'), summary: periodText },
    { title: t('Run layout'), summary: layoutSummary },
    { title: t('Segment'), summary: segmentSummary },
    { title: t('Further conditions'), summary: condSummary },
    { title: t('Name and save'), summary: shownNameText },
  ];
  const last = step === STEPS.length - 1;
  const nav = (
    <>
      {step > 0 && <button type="button" className="btn" onClick={() => setStep(step - 1)}>{t('Back')}</button>}
      {!last && <button type="button" className="btn primary" onClick={() => setStep(step + 1)}>{t('Next')}</button>}
    </>
  );
  const runOptions: Record<string, string[]> = { workoutTypes: options.workoutTypes, techniqueCues: options.techniqueCues, shoes: options.shoes, heartRateSources: options.heartRateSources, devices: options.devices };
  const runValue = (k: string) => f[k as 'workoutTypes'];

  return (
    <div className="builder wizard">
      <div className="wizard-head">
        {/* The steps, each named with what it sets; any opened by its name. */}
        <ol className="wizard-steps" aria-label={t('Steps')}>
          {STEPS.map((x, k) => (
            <li key={x.title}>
              <button type="button" className={`wizard-step-btn${k === step ? ' on' : ''}${k < step ? ' done' : ''}`} aria-current={k === step ? 'step' : undefined} onClick={() => setStep(k)}>
                <span className="wizard-num">{k + 1}</span>
                <span className="wizard-text"><span className="wizard-title">{x.title}</span><span className="muted small step-summary">{x.summary}</span></span>
              </button>
            </li>
          ))}
        </ol>
        {/* The matches: their count in the head, the runs listed only once it is opened ("w naglowku ilosc dopasowan dopiero po otwarciu lista biegi"). */}
        <details className="preview" aria-live="polite">
          <summary className="preview-count">
            {error ? t('Could not read the runs: {error}', { error }) : found === null ? t('Looking for efforts…') : tn(accepted.length, '{n} effort {inRuns}', '{n} efforts {inRuns}', { inRuns: tn(inRuns, 'in {n} run', 'in {n} runs') })}
            {leftOut > 0 && <span className="muted"> · {tn(leftOut, '{n} left out (shorter than a minute)', '{n} left out (shorter than a minute)')}</span>}
          </summary>
          {accepted.length > 0 && (
            <ul className="preview-list">
              {[...accepted].sort((a, b) => b.runStart.localeCompare(a.runStart) || a.start - b.start).map((i) => (
                <li key={i.id}><span>{date(i.runStart)}</span><span className="muted">{t('min {from}–{to}', { from: mmss(i.start), to: mmss(i.end) })} · {fmtPace(i.metrics.speed)} /km{i.metrics.heartRate ? ` · ${number(Math.round(i.metrics.heartRate))} bpm` : ''}</span></li>
              ))}
            </ul>
          )}
        </details>
      </div>

      <div className="wizard-body" role="group" aria-labelledby={`${uid}-step`}>
        <h3 className="wizard-step-title" id={`${uid}-step`}>{t('Step {n} of {total}', { n: step + 1, total: STEPS.length })} · {STEPS[step].title}</h3>
        {step === 0 && (
          <div className="field picks">
            <span>{t('Period')}</span>
            <span className="metric-picker" role="group" aria-label={t('Period')}>
              {PERIOD_PRESETS.map((p) => <button key={p} type="button" className={`pill ${preset === p ? 'on' : ''}`} aria-pressed={preset === p} onClick={() => { setPreset(p); runs(presetDates(p)); }}>{t(PRESET_LABEL[p])}</button>)}
              <span className="range">
                <input type="date" aria-label={t('From')} value={f.dateFrom ?? ''} onChange={(e) => { setPreset(null); runs({ dateFrom: e.target.value || null }); }} />
                <span className="muted">–</span>
                <input type="date" aria-label={t('To')} value={f.dateTo ?? ''} onChange={(e) => { setPreset(null); runs({ dateTo: e.target.value || null }); }} />
              </span>
            </span>
          </div>
        )}
        {step === 1 && (
          <>
            <LayoutField label={t('Layout of laps')} value={layout} layouts={options.layouts} any onChange={setLayout} />
            <div className="field">
              <span>{t('Segments from the laps')}</span>
              <div className="segmented wrap" role="radiogroup" aria-label={t('Segments from the laps')}>
                {([['none', t('No: whole run, time or distance (next step)')], ['laps', t('Each lap')], ['reps', t('The reps')]] as const).map(([k, l]) => {
                  const off = k === 'reps' && !layout && !options.layouts.length;
                  return <button key={k} type="button" role="radio" aria-checked={split === k} className={split === k ? 'on' : ''} disabled={off} title={k === 'reps' ? t('The effort laps of the runs of a layout of laps, as 3 × 10 min') : undefined} onClick={() => setSplit(k)}>{l}</button>;
                })}
              </div>
            </div>
            {split === 'laps' && planned && (
              <label className="field check">
                <input type="checkbox" checked={shape.type === 'lap' && !!shape.planned} onChange={(e) => setShapeTo(e.target.checked ? { type: 'lap', planned } : { type: 'lap' })} />
                <span>{t('Only laps set up as {length}', { length: lengthName(planned.kind, planned.target, SHOWN_WORDS) })} <span className="muted small">{t("(a workout's laps, not auto-laps)")}</span></span>
              </label>
            )}
          </>
        )}
        {step === 2 && (
          <>
            {split !== 'none' ? (
              <p className="muted small builder-note">{split === 'reps' ? t('Each rep of the layout is a segment (step Run layout).') : t('Each lap is a segment (step Run layout).')}</p>
            ) : (
              <>
                <div className="field">
                  <span className="sr-only">{t('Segment')}</span>
                  <div className="segmented wrap" role="radiogroup" aria-label={t('Segment')}>
                    {SEGMENTS.map(([k, l, s2]) => <button key={k} type="button" role="radio" aria-checked={segmentKey === k} className={segmentKey === k ? 'on' : ''} onClick={() => chooseSegment(s2)}>{l}</button>)}
                  </div>
                </div>
                {shape.type === 'fastest' && (
                  <div className="field picks">
                    <span>{t('Length')}</span>
                    <span className="metric-picker" role="group" aria-label={t('Length')}>
                      {STRETCH_PRESETS.filter((w) => w.kind === shape.kind).map((w) => { const on = w.target === shape.target; return <button key={stretchLabel(w)} type="button" className={`pill ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => chooseSegment({ type: 'fastest', ...w, effort: shape.effort })}>{stretchLabel(w)}</button>; })}
                      <span className="range">
                        <input aria-label={t('Length value')} type="number" min={0.1} step="any" value={shape.kind === 'time' ? shape.target / 60 : shape.target / 1000} onChange={(e) => { const n = Number(e.target.value); if (n > 0) chooseSegment({ type: 'fastest', kind: shape.kind, target: shape.kind === 'time' ? n * 60 : n * 1000, effort: shape.effort }); }} style={{ width: 64 }} />
                        <span className="muted small unit">{shape.kind === 'time' ? 'min' : 'km'}</span>
                      </span>
                    </span>
                  </div>
                )}
                {shape.type === 'fastest' && (
                  <label className="field check">
                    <input type="checkbox" checked={!!shape.effort} onChange={(e) => chooseSegment({ ...shape, effort: e.target.checked || undefined })} />
                    <span>{t('Only when run as an effort')} <span className="muted small">{t("(the run's best effort of the length, run hard)")}</span></span>
                  </label>
                )}
                {shape.type === 'steady' && (
                  <label className="field">
                    <span>{t('Kept for at least')}</span>
                    <span className="range"><input aria-label={t('Kept for at least')} type="number" min={1} step={1} value={shape.minDuration / 60} onChange={(e) => { const n = Number(e.target.value); if (n > 0) chooseSegment({ type: 'steady', minDuration: n * 60 }); }} style={{ width: 64 }} /><span className="muted small unit">min</span></span>
                  </label>
                )}
              </>
            )}
            {shape.type !== 'run' && (
              <div className="field">
                <span>{t('How many per run')}</span>
                <div className="segmented" role="radiogroup" aria-label={t('How many per run')}>
                  {PICKS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={rule.pick === k} className={rule.pick === k ? 'on' : ''} onClick={() => setRule((r) => ({ ...r, pick: k }))}>{t(l)}</button>)}
                </div>
              </div>
            )}
            <div className="field">
              <span>{t('Statistic of each effort')}</span>
              <div className="segmented" role="radiogroup" aria-label={t('Statistic')} title={t("The average over the moving samples; the median, minimum or maximum over the effort's 10 s windows")}>
                {STATS.map((st: Stat) => <button key={st} type="button" role="radio" aria-checked={rule.stat === st} className={rule.stat === st ? 'on' : ''} onClick={() => setRule((r) => ({ ...r, stat: st }))}>{t(STAT_LABEL[st])}</button>)}
              </div>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            {runFields.filter((x) => x.key !== 'title' && x.key !== 'laps' && shown(x.key)).map((x) => (
              <Opt key={x.key} label={x.label} onRemove={() => remove(x.key)}><Picks label={x.label} options={runOptions[x.key]} chosen={runValue(x.key)} onChange={(v) => runs({ [x.key]: v })} /></Opt>
            ))}
            {shown('title') && <Opt label={t('Title contains')} onRemove={() => remove('title')}><label className="field"><span>{t('Title contains')}</span><input aria-label={t('Title contains')} placeholder={t('e.g. COROS test')} value={f.title} onChange={(e) => runs({ title: e.target.value })} style={{ width: 200 }} /></label></Opt>}
            {shown('laps') && <Opt label={t('Laps in the run')} onRemove={() => remove('laps')}><Range label={t('Laps in the run')} names={[t('Laps from'), t('Laps to')]} unit="" from={f.lapsMin} to={f.lapsMax} show={num} parse={(t) => parseNum(t)} onChange={(a, b) => runs({ lapsMin: a, lapsMax: b })} /></Opt>}
            {shown('pace') && <Opt label={t('Pace')} onRemove={() => remove('pace')}><Range label={t('Pace')} names={[t('Pace from'), t('Pace to')]} unit="/km" from={c.paceMin} to={c.paceMax} show={mmss} parse={parsePace} onChange={(a, b) => cond({ paceMin: a, paceMax: b })} /></Opt>}
            {shown('hr') && <Opt label={t('Heart rate')} onRemove={() => remove('hr')}><Range label={t('Heart rate')} names={[t('Heart rate from'), t('Heart rate to')]} unit="bpm" from={c.hrMin} to={c.hrMax} show={num} parse={(t) => parseNum(t)} onChange={(a, b) => cond({ hrMin: a, hrMax: b })} /></Opt>}
            {shown('metric') && (
              <Opt label={t('Another metric')} onRemove={() => remove('metric')}>
                <label className="field">
                  <span>{t('Another metric')}</span>
                  <select className="select small" aria-label={t('Another metric')} value={c.metric ?? ''} onChange={(e) => cond({ metric: e.target.value || null, metricMin: null, metricMax: null })}>
                    <option value="">{t('None')}</option>
                    {otherMetrics.map((k) => <option key={k} value={k}>{known.view(k).title}</option>)}
                  </select>
                </label>
                {chosenMetric && (
                  <Range key={chosenMetric.key} label={chosenMetric.title} names={[t('{metric} from', { metric: chosenMetric.title }), t('{metric} to', { metric: chosenMetric.title })]} unit={chosenMetric.invert ? '/km' : chosenMetric.unit}
                    from={c.metricMin ?? null} to={c.metricMax ?? null} show={chosenMetric.invert ? mmss : (v) => num(+v.toFixed(2))} parse={chosenMetric.invert ? parsePace : (t) => parseNum(t)}
                    onChange={(a, b) => cond({ metricMin: a, metricMax: b })} />
                )}
              </Opt>
            )}
            {shown('distance') && <Opt label={t('Distance')} onRemove={() => remove('distance')}><Range label={t('Distance')} names={[t('Distance from'), t('Distance to')]} unit="km" from={c.distanceMin} to={c.distanceMax} show={(v) => num(+(v / 1000).toFixed(2))} parse={(t) => parseNum(t, 1000)} onChange={(a, b) => cond({ distanceMin: a, distanceMax: b })} /></Opt>}
            {shown('duration') && <Opt label={t('Duration')} onRemove={() => remove('duration')}><Range label={t('Duration')} names={[t('Duration from'), t('Duration to')]} unit="min" from={c.durationMin} to={c.durationMax} show={(v) => num(Math.round(v / 60))} parse={(t) => parseNum(t, 60)} onChange={(a, b) => cond({ durationMin: a, durationMax: b })} /></Opt>}
            {shown('alwaysHr') && <Opt label={t('Heart rate never below / above')} onRemove={() => remove('alwaysHr')}><Range label={t('Heart rate never below / above')} names={[t('Heart rate never below'), t('Heart rate never above')]} unit="bpm" from={c.alwaysHrMin} to={c.alwaysHrMax} show={num} parse={(t) => parseNum(t)} onChange={(a, b) => cond({ alwaysHrMin: a, alwaysHrMax: b })} /></Opt>}
            {shown('alwaysPace') && <Opt label={t('Pace always within')} onRemove={() => remove('alwaysPace')}><Range label={t('Pace always within')} names={[t('Pace always from'), t('Pace always to')]} unit="/km" from={c.alwaysPaceMin} to={c.alwaysPaceMax} show={mmss} parse={parsePace} onChange={(a, b) => cond({ alwaysPaceMin: a, alwaysPaceMax: b })} /></Opt>}
            {shown('start') && (
              <Opt label={t('Start of the effort')} onRemove={() => remove('start')}>
                <label className="field">
                  <span>{t('Start of the effort')}</span>
                  <select className="select small" aria-label={t('Start of the effort')} value={c.start} onChange={(e) => cond({ start: e.target.value as BlockStart })}>
                    <option value="any">{t('any')}</option>
                    <option value="standing">{t('standing (right after a stop)')}</option>
                    <option value="flying">{t('flying (on the move)')}</option>
                  </select>
                </label>
              </Opt>
            )}
            <AddField label={t('+ Add a condition')} groups={[
              [t('The run'), runFields.filter((x) => x.offered && !shown(x.key)).map((x) => [x.key, x.label])],
              [t('The segment'), condFields.filter((x) => x.offered && !shown(x.key)).map((x) => [x.key, x.label])],
            ]} onAdd={(k) => setAdded((a) => [...a, k])} />
            <p className="muted small builder-note">{t('The segment’s on average over it; “never” and “always” in each of its 10 s windows.')}</p>
            {children}
          </>
        )}
        {step === 4 && (
          <label className="field stacked"><span>{t('Name')}</span><input aria-label={t('Name')} value={shownNameText} onChange={(e) => { setName(e.target.value); setNamed(true); setTyped(true); }} /></label>
        )}
      </div>
      <div className="builder-actions">{footer({ rule, name: effectiveName.trim() || ruleName(rule), segments: found === null ? null : accepted.length, last, nav })}</div>
    </div>
  );
}
