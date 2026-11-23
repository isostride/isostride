'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PERIOD_PRESETS, REFERENCE_SHAPES, RULE_TOLERANCES, STATS, STAT_LABEL, STRETCH_PRESETS, presetDates, ruleName, ruleOf, type BlockDefinition, type BlockInstance, type BlockStart, type Conditions, type PeriodPreset, type Pick, type Rule, type RuleShape, type RunFilter, type Stat, type Tolerances, shapeName } from '@/lib/blocks';
import { instancesInWorker } from '@/lib/client';
import { date, pace as fmtPace } from '@/lib/format';

export interface BuilderOptions {
  workoutTypes: string[];
  techniqueCues: string[];
  shoes: string[];
  heartRateSources: string[];
  devices: string[];
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
const PRESET_LABEL: Record<PeriodPreset, string> = { all: 'All runs', month: 'Last 30 days', quarter: 'Last 3 months', year: 'This year' };
const SHAPES: [RuleShape['type'], string][] = [['run', 'Whole runs'], ['lap', 'Laps'], ['fastest', 'Best effort'], ['steady', 'Steady effort']];
const stretchLabel = (w: { kind: 'time' | 'distance'; target: number }) => (w.kind === 'time' ? `${w.target / 60} min` : `${w.target / 1000} km`);

/** A pair of inputs for one range; the value is kept in the rule's unit. */
function Range({ label, names, unit, from, to, show, parse, onChange }: {
  label: string; names: [string, string]; unit: string; from: number | null; to: number | null;
  show: (v: number) => string; parse: (text: string) => number | null; onChange: (from: number | null, to: number | null) => void;
}) {
  return (
    <div className="field">
      <span>{label}</span>
      <span className="range">
        <input aria-label={names[0]} placeholder="from" defaultValue={from === null ? '' : show(from)} onChange={(e) => onChange(parse(e.target.value), to)} />
        <span className="muted">–</span>
        <input aria-label={names[1]} placeholder="to" defaultValue={to === null ? '' : show(to)} onChange={(e) => onChange(from, parse(e.target.value))} />
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
  const [rule, setRule] = useState<Rule>(initial ?? ruleOf({ type: 'fastest', kind: 'time', target: 300 }));
  /** the stretch taken from a run (a route, a profile, a lap layout, the main effort): offered beside the others */
  const [reference] = useState(() => (initial && (REFERENCE_SHAPES as readonly string[]).includes(initial.shape.type) ? initial.shape : null));
  /** the length of the laps a workout set up, from the block as it opened */
  const [planned] = useState(() => (initial?.shape.type === 'lap' ? initial.shape.planned ?? null : null));
  const [name, setName] = useState(initialName ?? '');
  const [named, setNamed] = useState(!!initialName && initialName !== (initial ? ruleName(initial) : ''));
  const [preset, setPreset] = useState<PeriodPreset | null>(rule.runs.dateFrom === null && rule.runs.dateTo === null ? 'all' : null);
  const [found, setFound] = useState<BlockInstance[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runs = (p: Partial<RunFilter>) => setRule((r) => ({ ...r, runs: { ...r.runs, ...p } }));
  const cond = (p: Partial<Conditions>) => setRule((r) => ({ ...r, conditions: { ...r.conditions, ...p } }));
  const setShape = (type: RuleShape['type']) => setRule((r) => {
    if (r.shape.type === type) return r;
    const shape: RuleShape | null = reference && reference.type === type ? reference : type === 'fastest' ? { type, kind: 'time', target: 300 } : type === 'steady' ? { type, minDuration: 600 } : type === 'run' || type === 'lap' ? { type } : null;
    if (!shape) return r;
    return { ...r, shape, pick: type === 'fastest' ? 'best' : 'all' };
  });
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
          <span>From each run</span>
          <div className="segmented" role="radiogroup" aria-label="From each run">
            {reference && <button type="button" role="radio" aria-checked={shape.type === reference.type} className={shape.type === reference.type ? 'on' : ''} onClick={() => setShape(reference.type)} title="Taken from a run">{shapeName(reference)}</button>}
            {SHAPES.map(([t, l]) => <button key={t} type="button" role="radio" aria-checked={shape.type === t} className={shape.type === t ? 'on' : ''} onClick={() => setShape(t)}>{l}</button>)}
          </div>
        </div>
        {shape.type === 'fastest' && (
          <div className="field picks">
            <span>Length</span>
            <span className="metric-picker" role="group" aria-label="Length">
              {STRETCH_PRESETS.map((w) => { const on = w.kind === shape.kind && w.target === shape.target; return <button key={stretchLabel(w)} type="button" className={`pill ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setRule((r) => ({ ...r, shape: { type: 'fastest', ...w, effort: shape.effort } }))}>{stretchLabel(w)}</button>; })}
              <span className="range">
                <input aria-label="Length value" type="number" min={1} step={1} value={shape.kind === 'time' ? shape.target / 60 : shape.target / 1000} onChange={(e) => { const n = Number(e.target.value); if (n > 0) setRule((r) => ({ ...r, shape: { type: 'fastest', kind: shape.kind, target: shape.kind === 'time' ? n * 60 : n * 1000, effort: shape.effort } })); }} style={{ width: 64 }} />
                <select className="select small" aria-label="Length unit" value={shape.kind} onChange={(e) => setRule((r) => ({ ...r, shape: { type: 'fastest', kind: e.target.value as 'time' | 'distance', target: e.target.value === 'time' ? 300 : 5000, effort: shape.effort } }))}>
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
            <span>Only when run as an effort <span className="muted small">(the run&apos;s best effort of the length, run hard)</span></span>
          </label>
        )}
        {shape.type === 'lap' && (reference?.type === 'lap' || shape.planned) && (
          <label className="field check">
            <input type="checkbox" checked={!!shape.planned} onChange={(e) => setRule((r) => ({ ...r, shape: e.target.checked && planned ? { type: 'lap', planned } : { type: 'lap' } }))} />
            <span>Only laps set up as {planned ? (planned.kind === 'time' ? `${planned.target / 60} min` : `${planned.target / 1000} km`) : 'a length'} <span className="muted small">(a workout&apos;s laps, not auto-laps)</span></span>
          </label>
        )}
        {shape.type === 'steady' && (
          <label className="field">
            <span>Kept for at least</span>
            <span className="range"><input aria-label="Kept for at least" type="number" min={1} step={1} value={shape.minDuration / 60} onChange={(e) => { const n = Number(e.target.value); if (n > 0) setRule((r) => ({ ...r, shape: { type: 'steady', minDuration: n * 60 } })); }} style={{ width: 64 }} /><span className="muted small unit">min</span></span>
          </label>
        )}
      </div>

      <div className="builder-section">
        <div className="builder-title">In which runs</div>
        <div className="field picks">
          <span>Period</span>
          <span className="metric-picker" role="group" aria-label="Period">
            {PERIOD_PRESETS.map((p) => <button key={p} type="button" className={`pill ${preset === p ? 'on' : ''}`} aria-pressed={preset === p} onClick={() => { setPreset(p); runs(presetDates(p)); }}>{PRESET_LABEL[p]}</button>)}
            <span className="range">
              <input type="date" aria-label="From" value={rule.runs.dateFrom ?? ''} onChange={(e) => { setPreset(null); runs({ dateFrom: e.target.value || null }); }} />
              <span className="muted">–</span>
              <input type="date" aria-label="To" value={rule.runs.dateTo ?? ''} onChange={(e) => { setPreset(null); runs({ dateTo: e.target.value || null }); }} />
            </span>
          </span>
        </div>
        <Picks label="Workout type" options={options.workoutTypes} chosen={rule.runs.workoutTypes} onChange={(v) => runs({ workoutTypes: v })} />
        <Picks label="Shoes" options={options.shoes} chosen={rule.runs.shoes} onChange={(v) => runs({ shoes: v })} />
        <label className="field"><span>Title contains</span><input aria-label="Title contains" placeholder="e.g. COROS test" value={rule.runs.title} onChange={(e) => runs({ title: e.target.value })} style={{ width: 200 }} /></label>
        <details className="more">
          <summary className="muted small">More about the runs</summary>
          <Picks label="Technique cue" options={options.techniqueCues} chosen={rule.runs.techniqueCues} onChange={(v) => runs({ techniqueCues: v })} />
          <Picks label="Heart rate from" options={options.heartRateSources} chosen={rule.runs.heartRateSources} onChange={(v) => runs({ heartRateSources: v })} />
          <Picks label="Watch" options={options.devices} chosen={rule.runs.devices} onChange={(v) => runs({ devices: v })} />
          <Range label="Laps in the run" names={['Laps from', 'Laps to']} unit="" from={rule.runs.lapsMin} to={rule.runs.lapsMax} show={String} parse={(t) => parseNum(t)} onChange={(a, b) => runs({ lapsMin: a, lapsMax: b })} />
        </details>
      </div>

      <div className="builder-section">
        <div className="builder-title">The effort, on average</div>
        <Range label="Pace" names={['Pace from', 'Pace to']} unit="/km" from={c.paceMin} to={c.paceMax} show={mmss} parse={parsePace} onChange={(a, b) => cond({ paceMin: a, paceMax: b })} />
        <Range label="Heart rate" names={['Heart rate from', 'Heart rate to']} unit="bpm" from={c.hrMin} to={c.hrMax} show={String} parse={(t) => parseNum(t)} onChange={(a, b) => cond({ hrMin: a, hrMax: b })} />
        {shape.type !== 'fastest' && (
          <>
            <Range label="Distance" names={['Distance from', 'Distance to']} unit="km" from={c.distanceMin} to={c.distanceMax} show={(v) => String(+(v / 1000).toFixed(2))} parse={(t) => parseNum(t, 1000)} onChange={(a, b) => cond({ distanceMin: a, distanceMax: b })} />
            <Range label="Duration" names={['Duration from', 'Duration to']} unit="min" from={c.durationMin} to={c.durationMax} show={(v) => String(Math.round(v / 60))} parse={(t) => parseNum(t, 60)} onChange={(a, b) => cond({ durationMin: a, durationMax: b })} />
          </>
        )}
        <div className="builder-title" title="Checked in each 10 s window of the effort">The effort, at every moment</div>
        <Range label="Heart rate never below / above" names={['Heart rate never below', 'Heart rate never above']} unit="bpm" from={c.alwaysHrMin} to={c.alwaysHrMax} show={String} parse={(t) => parseNum(t)} onChange={(a, b) => cond({ alwaysHrMin: a, alwaysHrMax: b })} />
        <Range label="Pace always within" names={['Pace always from', 'Pace always to']} unit="/km" from={c.alwaysPaceMin} to={c.alwaysPaceMax} show={mmss} parse={parsePace} onChange={(a, b) => cond({ alwaysPaceMin: a, alwaysPaceMax: b })} />
        <details className="more">
          <summary className="muted small">More: start, how many per run, statistic</summary>
          {shape.type !== 'run' && (
            <label className="field">
              <span>Start of the effort</span>
              <select className="select small" aria-label="Start of the effort" value={c.start} onChange={(e) => cond({ start: e.target.value as BlockStart })}>
                <option value="any">any</option>
                <option value="standing">standing (right after a stop)</option>
                <option value="flying">flying (on the move)</option>
              </select>
            </label>
          )}
          {shape.type !== 'run' && (
            <div className="field">
              <span>From each run</span>
              <div className="segmented" role="radiogroup" aria-label="From each run">
                {([['best', 'The fastest one'], ['all', 'Every one']] as [Pick, string][]).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={rule.pick === k} className={rule.pick === k ? 'on' : ''} onClick={() => setRule((r) => ({ ...r, pick: k }))}>{l}</button>)}
              </div>
            </div>
          )}
          <div className="field">
            <span>Statistic of each effort</span>
            <div className="segmented" role="radiogroup" aria-label="Statistic" title="The average over the moving samples; the median, minimum or maximum over the effort's 10 s windows">
              {STATS.map((st: Stat) => <button key={st} type="button" role="radio" aria-checked={rule.stat === st} className={rule.stat === st ? 'on' : ''} onClick={() => setRule((r) => ({ ...r, stat: st }))}>{STAT_LABEL[st]}</button>)}
            </div>
          </div>
        </details>
      </div>

      <label className="field"><span>Name</span><input aria-label="Name" value={effectiveName} onChange={(e) => { setName(e.target.value); setNamed(true); }} style={{ width: 340 }} /></label>

      <div className="preview" aria-live="polite">
        <div className="preview-count">
          {error ? `Could not read the runs: ${error}` : found === null ? 'Looking for efforts…' : `${accepted.length} effort${accepted.length === 1 ? '' : 's'} in ${inRuns} run${inRuns === 1 ? '' : 's'}`}
          {leftOut > 0 && <span className="muted"> · {leftOut} left out (shorter than a minute)</span>}
        </div>
        {accepted.length > 0 && (
          <ul className="preview-list">
            {[...accepted].sort((a, b) => b.runStart.localeCompare(a.runStart) || a.start - b.start).slice(0, 6).map((i) => (
              <li key={i.id}><span>{date(i.runStart)}</span><span className="muted">min {mmss(i.start)}–{mmss(i.end)} · {fmtPace(i.metrics.speed)} /km{i.metrics.heartRate ? ` · ${Math.round(i.metrics.heartRate)} bpm` : ''}</span></li>
            ))}
            {accepted.length > 6 && <li className="muted">… and {accepted.length - 6} more</li>}
          </ul>
        )}
      </div>
      {children}
      <div className="builder-actions">{footer({ rule, name: effectiveName.trim() || ruleName(rule), segments: found === null ? null : accepted.length })}</div>
    </div>
  );
}
