'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PERIOD_PRESETS, STATS, STAT_LABEL, datesPeriod, describeRunSet, formatRunSet, presetPeriod, selectRuns, type PeriodPreset, type RunSet, type Stat } from '@/lib/ask';
import type { AnalysisItem } from '@/lib/compare';
import type { BlockDefinition } from '@/lib/blocks';
import type { RunsIndex } from '@/lib/kernel';

export const runName = (start: string, distance: number, title?: string | null) =>
  `${title ? `${title} · ` : ''}${new Date(start).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · ${(distance / 1000).toFixed(1)} km`;

const PRESET_LABEL: Record<PeriodPreset, string> = { all: 'All runs', month: 'Last 30 days', quarter: 'Last 3 months', year: 'This year' };

/**
 * The picker of the Analysis screen: blocks and runs, searchable (the arrow keys move, Enter
 * adds), or a run set built from controls, the runs it covers counted as the controls change.
 */
export function AddDialog({ defs, runs, items, options, onAdd, onClose }: {
  defs: BlockDefinition[]; runs: RunsIndex['runs']; items: AnalysisItem[];
  options: { workoutTypes: string[]; shoes: string[] };
  onAdd: (kind: AnalysisItem['kind'], id: string) => void; onClose: () => void;
}) {
  const [tab, setTab] = useState<'list' | 'set'>('list');
  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" role="dialog" aria-label="Add block or run" onClick={(e) => e.stopPropagation()}>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'list'} className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>Blocks and runs</button>
          <button type="button" role="tab" aria-selected={tab === 'set'} className={tab === 'set' ? 'on' : ''} onClick={() => setTab('set')}>Runs matching…</button>
        </div>
        {tab === 'list' ? <ListTab defs={defs} runs={runs} items={items} onAdd={onAdd} /> : <SetTab runs={runs} items={items} options={options} onAdd={(spec) => onAdd('set', spec)} />}
      </div>
    </div>
  );
}

function ListTab({ defs, runs, items, onAdd }: { defs: BlockDefinition[]; runs: RunsIndex['runs']; items: AnalysisItem[]; onAdd: (kind: AnalysisItem['kind'], id: string) => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const match = (text: string) => words.every((w) => text.toLowerCase().includes(w));
  const optionsList = [
    ...defs.filter((d) => !items.some((i) => i.id === d.id) && match(`${d.name} block`)).map((d) => ({ kind: 'block' as const, id: d.id, text: d.name, hint: 'block' })),
    ...[...runs].reverse().filter((r) => !items.some((i) => i.id === r.id))
      .filter((r) => match(`${runName(r.startTime, r.distance, r.title)} ${r.workoutType ?? ''} ${r.startTime.slice(0, 10)} run`))
      .map((r) => ({ kind: 'run' as const, id: r.id, text: runName(r.startTime, r.distance, r.title), hint: [r.workoutType, `${Math.floor(r.duration / 60)} min`].filter(Boolean).join(' · ') })),
  ].slice(0, 60);
  return (
    <>
      <input ref={input} value={q} placeholder="Search blocks and runs…" aria-label="Search blocks and runs"
        onChange={(e) => { setQ(e.target.value); setActive(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(optionsList.length - 1, a + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === 'Enter' && optionsList[active]) onAdd(optionsList[active].kind, optionsList[active].id);
        }} />
      <div className="palette-list">
        {optionsList.map((o, k) => (
          <div key={o.id}>
            {(k === 0 || optionsList[k - 1].kind !== o.kind) && <div className="palette-group">{o.kind === 'block' ? 'Blocks' : 'Runs'}</div>}
            <div role="option" aria-selected={k === active} className={`palette-item ${k === active ? 'on' : ''}`} onMouseEnter={() => setActive(k)} onClick={() => onAdd(o.kind, o.id)}>
              <span>{o.text}</span>
              <span className="muted small">{o.hint}</span>
            </div>
          </div>
        ))}
        {!optionsList.length && <div className="muted small" style={{ padding: 12 }}>Nothing found.</div>}
      </div>
    </>
  );
}

/** A run set from controls: the period, the filters and the statistic; the runs it covers counted live. */
function SetTab({ runs, items, options, onAdd }: { runs: RunsIndex['runs']; items: AnalysisItem[]; options: { workoutTypes: string[]; shoes: string[] }; onAdd: (spec: string) => void }) {
  const [set, setSet] = useState<RunSet>({ period: presetPeriod('all'), filters: { workoutType: null, shoes: null, title: null }, stat: 'avg' });
  const [preset, setPreset] = useState<PeriodPreset | null>('all');
  const patch = (p: Partial<RunSet>) => setSet((s) => ({ ...s, ...p }));
  const count = useMemo(() => selectRuns(runs, set.period, set.filters).length, [runs, set]);
  const spec = formatRunSet(set);
  const already = items.some((i) => i.id === spec);
  return (
    <div className="runset-form">
      <div className="field">
        <span>Period</span>
        <span className="metric-picker" role="group" aria-label="Period">
          {PERIOD_PRESETS.map((p) => <button key={p} type="button" className={`pill ${preset === p ? 'on' : ''}`} aria-pressed={preset === p} onClick={() => { setPreset(p); patch({ period: presetPeriod(p) }); }}>{PRESET_LABEL[p]}</button>)}
        </span>
      </div>
      <div className="field">
        <span>Dates</span>
        <span className="range">
          <input type="date" aria-label="From" value={set.period.from ?? ''} onChange={(e) => { setPreset(null); patch({ period: datesPeriod(e.target.value, set.period.to) }); }} />
          <span className="muted">–</span>
          <input type="date" aria-label="To" value={set.period.to ?? ''} onChange={(e) => { setPreset(null); patch({ period: datesPeriod(set.period.from, e.target.value) }); }} />
        </span>
      </div>
      <label className="field"><span>Workout type</span>
        <select className="select small" aria-label="Workout type" value={set.filters.workoutType ?? ''} onChange={(e) => patch({ filters: { ...set.filters, workoutType: e.target.value || null } })}>
          <option value="">any</option>
          {options.workoutTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label className="field"><span>Shoes</span>
        <select className="select small" aria-label="Shoes" value={set.filters.shoes ?? ''} onChange={(e) => patch({ filters: { ...set.filters, shoes: e.target.value || null } })}>
          <option value="">any</option>
          {options.shoes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label className="field"><span>Title contains</span><input aria-label="Title contains" placeholder="e.g. COROS test" value={set.filters.title ?? ''} onChange={(e) => patch({ filters: { ...set.filters, title: e.target.value.trim() || null } })} style={{ width: 180 }} /></label>
      <div className="field">
        <span>Statistic of each run</span>
        <div className="segmented" role="radiogroup" aria-label="Statistic" title="The average over the moving samples; the median, minimum or maximum over the run's 10 s windows">
          {STATS.map((st: Stat) => <button key={st} type="button" role="radio" aria-checked={set.stat === st} className={set.stat === st ? 'on' : ''} onClick={() => patch({ stat: st })}>{STAT_LABEL[st]}</button>)}
        </div>
      </div>
      <div className="preview" aria-live="polite">
        <div className="preview-count">{count} run{count === 1 ? '' : 's'} · {describeRunSet(set)}</div>
      </div>
      <button type="button" className="btn primary" style={{ width: '100%', marginTop: 12 }} disabled={!count || already} onClick={() => onAdd(spec)}>{already ? 'Already added' : 'Add these runs'}</button>
    </div>
  );
}
