'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
const SHAPES: [RuleShape['type'], string][] = [['run', msg('Whole runs')], ['lap', msg('Laps')], ['pattern', msg('Workout reps')], ['fastest', msg('Best effort')], ['steady', msg('Steady effort')]];
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
 * (identical) or the same reps in any layout (similar). With `any`, none may be chosen.
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

export interface BuilderState {
  rule: Rule;
  name: string;
  /** segments the rule selects now; null while they are counted */
  segments: number | null;
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
  const [error, setError] = useState<string | null>(null);
  const runs = (p: Partial<RunFilter>) => setRule((r) => ({ ...r, runs: { ...r.runs, ...p } }));
  const cond = (p: Partial<Conditions>) => setRule((r) => ({ ...r, conditions: { ...r.conditions, ...p } }));
  // Any other metric of the folder's runs, on average within a range (requirement "Every metric offered everywhere").
  const known = useMetrics();
  const otherMetrics = known.blockKeys.filter((k) => k !== 'speed' && k !== 'heartRate');
  const chosenMetric = rule.conditions.metric ? known.view(rule.conditions.metric) : null;
  const setShape = (type: RuleShape['type']) => setRule((r) => {
    if (r.shape.type === type) return r;
    // Workout reps: of the layout the block had, else of the layout most runs follow.
    const layout = options.layouts[0];
    const shape: RuleShape | null = reference && reference.type === type ? reference : type === 'fastest' ? { type, kind: 'time', target: 300 } : type === 'steady' ? { type, minDuration: 600 } : type === 'run' || type === 'lap' ? { type }
      : type === 'pattern' && layout ? { type, laps: layout.laps, tolerance: 0.03, match: 'identical' } : null;
    if (!shape) return r;
    return { ...r, shape, pick: type === 'fastest' ? 'best' : 'all' };
  });
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
  const shape = rule.shape;

  return (
    <div className="builder">
      <div className="builder-section">
        <div className="field">
          <span>{t('From each run')}</span>
          <div className="segmented" role="radiogroup" aria-label={t('From each run')}>
            {reference && reference.type !== 'pattern' && <button type="button" role="radio" aria-checked={shape.type === reference.type} className={shape.type === reference.type ? 'on' : ''} onClick={() => setShape(reference.type)} title={t('Taken from a run')}>{shapeName(reference)}</button>}
            {SHAPES.map(([k, l]) => {
              const none = k === 'pattern' && !options.layouts.length && reference?.type !== 'pattern';
              return <button key={k} type="button" role="radio" aria-checked={shape.type === k} className={shape.type === k ? 'on' : ''} disabled={none} title={none ? t('No layout of laps found in your runs yet') : k === 'pattern' ? t('The effort laps of the runs of a layout of laps, as 3 × 10 min') : undefined} onClick={() => setShape(k)}>{t(l)}</button>;
            })}
          </div>
        </div>
        {shape.type === 'fastest' && (
          <div className="field picks">
            <span>{t('Length')}</span>
            <span className="metric-picker" role="group" aria-label={t('Length')}>
              {STRETCH_PRESETS.map((w) => { const on = w.kind === shape.kind && w.target === shape.target; return <button key={stretchLabel(w)} type="button" className={`pill ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setRule((r) => ({ ...r, shape: { type: 'fastest', ...w, effort: shape.effort } }))}>{stretchLabel(w)}</button>; })}
              <span className="range">
                <input aria-label={t('Length value')} type="number" min={1} step={1} value={shape.kind === 'time' ? shape.target / 60 : shape.target / 1000} onChange={(e) => { const n = Number(e.target.value); if (n > 0) setRule((r) => ({ ...r, shape: { type: 'fastest', kind: shape.kind, target: shape.kind === 'time' ? n * 60 : n * 1000, effort: shape.effort } })); }} style={{ width: 64 }} />
                <select className="select small" aria-label={t('Length unit')} value={shape.kind} onChange={(e) => setRule((r) => ({ ...r, shape: { type: 'fastest', kind: e.target.value as 'time' | 'distance', target: e.target.value === 'time' ? 300 : 5000, effort: shape.effort } }))}>
                  <option value="time">min</option>
                  <option value="distance">km</option>
                </select>
              </span>
            </span>
          </div>
        )}
        {shape.type === 'fastest' && (
          <label className="field check">
            <input type="checkbox" checked={!!shape.effort} onChange={(e) => setRule((r) => ({ ...r, shape: { ...shape, effort: e.target.checked || undefined } }))} />
            <span>{t('Only when run as an effort')} <span className="muted small">{t("(the run's best effort of the length, run hard)")}</span></span>
          </label>
        )}
        {shape.type === 'lap' && (reference?.type === 'lap' || shape.planned) && (
          <label className="field check">
            <input type="checkbox" checked={!!shape.planned} onChange={(e) => setRule((r) => ({ ...r, shape: e.target.checked && planned ? { type: 'lap', planned } : { type: 'lap' } }))} />
            <span>{t('Only laps set up as {length}', { length: planned ? lengthName(planned.kind, planned.target, SHOWN_WORDS) : t('a length') })} <span className="muted small">{t("(a workout's laps, not auto-laps)")}</span></span>
          </label>
        )}
        {shape.type === 'pattern' && (
          <LayoutField label={t('Layout of laps')} value={{ laps: shape.laps, match: shape.match ?? 'identical' }} layouts={options.layouts}
            onChange={(v) => v && setRule((r) => ({ ...r, shape: { type: 'pattern', laps: v.laps, tolerance: shape.tolerance, match: v.match } }))} />
        )}
        {shape.type === 'steady' && (
          <label className="field">
            <span>{t('Kept for at least')}</span>
            <span className="range"><input aria-label={t('Kept for at least')} type="number" min={1} step={1} value={shape.minDuration / 60} onChange={(e) => { const n = Number(e.target.value); if (n > 0) setRule((r) => ({ ...r, shape: { type: 'steady', minDuration: n * 60 } })); }} style={{ width: 64 }} /><span className="muted small unit">min</span></span>
          </label>
        )}
      </div>

      <div className="builder-section">
        <div className="builder-title">{t('In which runs')}</div>
        <div className="field picks">
          <span>{t('Period')}</span>
          <span className="metric-picker" role="group" aria-label={t('Period')}>
            {PERIOD_PRESETS.map((p) => <button key={p} type="button" className={`pill ${preset === p ? 'on' : ''}`} aria-pressed={preset === p} onClick={() => { setPreset(p); runs(presetDates(p)); }}>{t(PRESET_LABEL[p])}</button>)}
            <span className="range">
              <input type="date" aria-label={t('From')} value={rule.runs.dateFrom ?? ''} onChange={(e) => { setPreset(null); runs({ dateFrom: e.target.value || null }); }} />
              <span className="muted">–</span>
              <input type="date" aria-label={t('To')} value={rule.runs.dateTo ?? ''} onChange={(e) => { setPreset(null); runs({ dateTo: e.target.value || null }); }} />
            </span>
          </span>
        </div>
        <Picks label={t('Workout type')} options={options.workoutTypes} chosen={rule.runs.workoutTypes} onChange={(v) => runs({ workoutTypes: v })} />
        <Picks label={t('Shoes')} options={options.shoes} chosen={rule.runs.shoes} onChange={(v) => runs({ shoes: v })} />
        {options.layouts.length > 0 || rule.runs.layout ? <LayoutField label={t('Lap layout')} value={rule.runs.layout ?? null} layouts={options.layouts} any onChange={(v) => runs({ layout: v ?? undefined })} /> : null}
        <label className="field"><span>{t('Title contains')}</span><input aria-label={t('Title contains')} placeholder={t('e.g. COROS test')} value={rule.runs.title} onChange={(e) => runs({ title: e.target.value })} style={{ width: 200 }} /></label>
        <details className="more">
          <summary className="muted small">{t('More about the runs')}</summary>
          <Picks label={t('Technique cue')} options={options.techniqueCues} chosen={rule.runs.techniqueCues} onChange={(v) => runs({ techniqueCues: v })} />
          <Picks label={t('Heart rate from')} options={options.heartRateSources} chosen={rule.runs.heartRateSources} onChange={(v) => runs({ heartRateSources: v })} />
          <Picks label={t('Watch')} options={options.devices} chosen={rule.runs.devices} onChange={(v) => runs({ devices: v })} />
          <Range label={t('Laps in the run')} names={[t('Laps from'), t('Laps to')]} unit="" from={rule.runs.lapsMin} to={rule.runs.lapsMax} show={num} parse={(t) => parseNum(t)} onChange={(a, b) => runs({ lapsMin: a, lapsMax: b })} />
        </details>
      </div>

      <div className="builder-section">
        <div className="builder-title">{t('The effort, on average')}</div>
        <Range label={t('Pace')} names={[t('Pace from'), t('Pace to')]} unit="/km" from={c.paceMin} to={c.paceMax} show={mmss} parse={parsePace} onChange={(a, b) => cond({ paceMin: a, paceMax: b })} />
        <Range label={t('Heart rate')} names={[t('Heart rate from'), t('Heart rate to')]} unit="bpm" from={c.hrMin} to={c.hrMax} show={num} parse={(t) => parseNum(t)} onChange={(a, b) => cond({ hrMin: a, hrMax: b })} />
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
        {shape.type !== 'fastest' && (
          <>
            <Range label={t('Distance')} names={[t('Distance from'), t('Distance to')]} unit="km" from={c.distanceMin} to={c.distanceMax} show={(v) => num(+(v / 1000).toFixed(2))} parse={(t) => parseNum(t, 1000)} onChange={(a, b) => cond({ distanceMin: a, distanceMax: b })} />
            <Range label={t('Duration')} names={[t('Duration from'), t('Duration to')]} unit="min" from={c.durationMin} to={c.durationMax} show={(v) => num(Math.round(v / 60))} parse={(t) => parseNum(t, 60)} onChange={(a, b) => cond({ durationMin: a, durationMax: b })} />
          </>
        )}
        <div className="builder-title" title={t('Checked in each 10 s window of the effort')}>{t('The effort, at every moment')}</div>
        <Range label={t('Heart rate never below / above')} names={[t('Heart rate never below'), t('Heart rate never above')]} unit="bpm" from={c.alwaysHrMin} to={c.alwaysHrMax} show={num} parse={(t) => parseNum(t)} onChange={(a, b) => cond({ alwaysHrMin: a, alwaysHrMax: b })} />
        <Range label={t('Pace always within')} names={[t('Pace always from'), t('Pace always to')]} unit="/km" from={c.alwaysPaceMin} to={c.alwaysPaceMax} show={mmss} parse={parsePace} onChange={(a, b) => cond({ alwaysPaceMin: a, alwaysPaceMax: b })} />
        <details className="more">
          <summary className="muted small">{t('More: start, how many per run, statistic')}</summary>
          {shape.type !== 'run' && (
            <label className="field">
              <span>{t('Start of the effort')}</span>
              <select className="select small" aria-label={t('Start of the effort')} value={c.start} onChange={(e) => cond({ start: e.target.value as BlockStart })}>
                <option value="any">{t('any')}</option>
                <option value="standing">{t('standing (right after a stop)')}</option>
                <option value="flying">{t('flying (on the move)')}</option>
              </select>
            </label>
          )}
          {shape.type !== 'run' && (
            <div className="field">
              <span>{t('From each run')}</span>
              <div className="segmented" role="radiogroup" aria-label={t('From each run')}>
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
        </details>
      </div>

      <label className="field"><span>{t('Name')}</span><input aria-label={t('Name')} value={shownNameText} onChange={(e) => { setName(e.target.value); setNamed(true); setTyped(true); }} style={{ width: 340 }} /></label>

      <div className="preview" aria-live="polite">
        <div className="preview-count">
          {error ? t('Could not read the runs: {error}', { error }) : found === null ? t('Looking for efforts…') : tn(accepted.length, '{n} effort {inRuns}', '{n} efforts {inRuns}', { inRuns: tn(inRuns, 'in {n} run', 'in {n} runs') })}
          {leftOut > 0 && <span className="muted"> · {tn(leftOut, '{n} left out (shorter than a minute)', '{n} left out (shorter than a minute)')}</span>}
        </div>
        {accepted.length > 0 && (
          <ul className="preview-list">
            {[...accepted].sort((a, b) => b.runStart.localeCompare(a.runStart) || a.start - b.start).slice(0, 6).map((i) => (
              <li key={i.id}><span>{date(i.runStart)}</span><span className="muted">{t('min {from}–{to}', { from: mmss(i.start), to: mmss(i.end) })} · {fmtPace(i.metrics.speed)} /km{i.metrics.heartRate ? ` · ${number(Math.round(i.metrics.heartRate))} bpm` : ''}</span></li>
            ))}
            {accepted.length > 6 && <li className="muted">{t('… and {n} more', { n: number(accepted.length - 6) })}</li>}
          </ul>
        )}
      </div>
      {children}
      <div className="builder-actions">{footer({ rule, name: effectiveName.trim() || ruleName(rule), segments: found === null ? null : accepted.length })}</div>
    </div>
  );
}
