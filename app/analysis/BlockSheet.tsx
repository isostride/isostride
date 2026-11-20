'use client';

import { useState } from 'react';
import type { BlockDefinition, BlockStart, Rule, Tolerances } from '@/lib/blocks';
import { RuleBuilder, type BuilderOptions } from './RuleBuilder';

const fmtPace = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

const FIELDS: { key: Exclude<keyof Tolerances, 'start'>; label: string; unit: string; scale?: number; pace?: boolean }[] = [
  { key: 'paceMin', label: 'Pace band from', unit: '/km', pace: true },
  { key: 'paceMax', label: 'Pace band to', unit: '/km', pace: true },
  { key: 'gradeMax', label: 'Grade: effort pace vs pace, max', unit: '%', scale: 100 },
  { key: 'cvMax', label: 'Pace steadiness: CV below', unit: '' },
  { key: 'effortBeforeMax', label: 'Effort in the 2 min before, max difference', unit: '%', scale: 100 },
  { key: 'hrSkip', label: 'Heart rate from minute (of the block, every instance); empty: the whole block', unit: 'min', scale: 1 / 60 },
  { key: 'routeShare', label: 'Route: points matched, min', unit: '%', scale: 100 },
  { key: 'routeRadius', label: 'Route: within', unit: 'm' },
];

/**
 * The sheet a block is changed in, opened from its chip on the Analysis screen: a rule in the
 * builder (with the segments it selects counted as it changes), a block found in the runs or
 * made on a run's chart by its name and matching tolerances. A kept block can be deleted here.
 */
export function BlockSheet({ def, kept, options, handle, onClose, onSave, onDelete }: {
  def: BlockDefinition;
  /** a block kept in the folder (it can be deleted), or one that lives in the link */
  kept: boolean;
  options: BuilderOptions;
  handle: FileSystemDirectoryHandle;
  onClose: () => void;
  onSave: (d: BlockDefinition) => void;
  onDelete: (d: BlockDefinition) => void;
}) {
  const remove = () => confirm(`Delete the block "${def.name}" and its segments? If it came from a suggestion, the suggestion returns.`) && onDelete(def);
  if (def.params.type === 'rule') {
    const { type: _type, ...rule } = def.params;
    return (
      <div className="sheet-backdrop" onClick={onClose}>
        <aside className="sheet wide" role="dialog" aria-label="Block" onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Block</h3>
            <span style={{ flex: 1 }} />
            <button className="btn icon" aria-label="Close" onClick={onClose}>✕</button>
          </div>
          <RuleBuilder initial={rule as Rule} initialName={def.name} options={options} handle={handle} footer={(s) => (
            <>
              <button className="btn primary" disabled={!s.segments} onClick={() => onSave({ ...def, name: s.name, params: { type: 'rule', ...s.rule } })}>{kept ? 'Save & re-detect' : 'Apply'}</button>
              {kept && <button className="btn danger" onClick={remove}>Delete block</button>}
            </>
          )} />
        </aside>
      </div>
    );
  }
  return <ToleranceSheet def={def} onClose={onClose} onSave={onSave} onDelete={remove} />;
}

function ToleranceSheet({ def, onClose, onSave, onDelete }: { def: BlockDefinition; onClose: () => void; onSave: (d: BlockDefinition) => void; onDelete: () => void }) {
  const [name, setName] = useState(def.name);
  const [tol, setTol] = useState<Tolerances>(def.tolerances);
  const show = (f: (typeof FIELDS)[number]) => {
    const v = tol[f.key];
    if (v === null) return '';
    return f.pace ? fmtPace(v) : String(Math.round(v * (f.scale ?? 1) * 100) / 100);
  };
  const parse = (f: (typeof FIELDS)[number], text: string): number | null => {
    if (!text.trim()) return null;
    if (f.pace) {
      const [m, s] = text.split(':').map(Number);
      return Number.isFinite(m) ? m * 60 + (s || 0) : null;
    }
    const n = Number(text);
    return Number.isFinite(n) ? n / (f.scale ?? 1) : null;
  };
  const fields = FIELDS.filter((f) => def.params.type === 'route' || !f.key.startsWith('route'));
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <aside className="sheet" role="dialog" aria-label="Block" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Block</h3>
          <span style={{ flex: 1 }} />
          <button className="btn icon" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <p className="muted small">Matching tolerances. Defaults come from the preliminary analysis of 18 Nov 2026; empty means not checked.</p>
        {fields.map((f) => (
          <label key={f.key} className="field">
            <span>{f.label}</span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input defaultValue={show(f)} placeholder="–" onBlur={(e) => setTol({ ...tol, [f.key]: parse(f, e.target.value) } as Tolerances)} style={{ width: 80 }} />
              <span className="muted small" style={{ width: 28 }}>{f.unit}</span>
            </span>
          </label>
        ))}
        <label className="field">
          <span>Start of every instance</span>
          <select aria-label="Start of every instance" value={tol.start} onChange={(e) => setTol({ ...tol, start: e.target.value as BlockStart })}>
            <option value="any">any</option>
            <option value="standing">standing (right after a stop)</option>
            <option value="flying">flying (on the move)</option>
          </select>
        </label>
        <button className="btn primary" style={{ width: '100%', marginTop: 12 }} onClick={() => onSave({ ...def, name, tolerances: tol })}>Save &amp; re-detect</button>
        <button className="btn danger" style={{ width: '100%', marginTop: 8 }} onClick={onDelete}>Delete block</button>
      </aside>
    </div>
  );
}
