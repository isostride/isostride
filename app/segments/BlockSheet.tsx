'use client';

import { useEffect, useRef, useState } from 'react';
import { useConfirm } from '@/components';
import { asRuleDefinition, type BlockDefinition, type BlockStart, type Rule, type Tolerances } from '@/lib/blocks';
import { RuleBuilder, type BuilderOptions } from './RuleBuilder';

const fmtPace = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

const FIELDS: { key: Exclude<keyof Tolerances, 'start'>; label: string; unit: string; scale?: number; pace?: boolean }[] = [
  { key: 'paceMin', label: 'Pace band from', unit: '/km', pace: true },
  { key: 'paceMax', label: 'Pace band to', unit: '/km', pace: true },
  { key: 'gradeMax', label: 'Grade: effort pace vs pace, max', unit: '%', scale: 100 },
  { key: 'cvMax', label: 'Pace steadiness: CV below', unit: '' },
  { key: 'effortBeforeMax', label: 'Effort in the 2 min before, max difference', unit: '%', scale: 100 },
  { key: 'hrSkip', label: 'Heart rate from minute (of each effort); empty: the whole effort', unit: 'min', scale: 1 / 60 },
  { key: 'routeShare', label: 'Route: points matched, min', unit: '%', scale: 100 },
  { key: 'routeRadius', label: 'Route: within', unit: 'm' },
];

/**
 * The one editor of a block (the runner's request of 22 Nov 2026: "nie chce tworzyc blokow na 5
 * roznych sposob"; requirement "One way to make a block"): which runs, the stretch of each, the
 * conditions, how many per run and the statistic, with the segments counted as it changes, and the
 * matching checks. A new block, one kept, a suggestion or one taken from a run all open here.
 */
export function BlockSheet({ def, kept, options, handle, onClose, onSave, onDelete, title = 'Segment' }: {
  def: BlockDefinition;
  /** a block kept in the folder (it can be deleted), or one not kept yet */
  kept: boolean;
  options: BuilderOptions;
  handle: FileSystemDirectoryHandle;
  onClose: () => void;
  onSave: (d: BlockDefinition) => void;
  onDelete?: (d: BlockDefinition) => void;
  title?: string;
}) {
  // One model: an older kind of block is edited as the rule it is.
  const one = asRuleDefinition(def);
  const { type: _type, ...rule } = one.params as Extract<BlockDefinition['params'], { type: 'rule' }>;
  const [tol, setTol] = useState<Tolerances>(one.tolerances);
  // Opened, the editor takes the focus; Esc closes it wherever the focus is.
  const box = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    box.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  const [confirmDialog, confirm] = useConfirm();
  const remove = async () => { if (onDelete && (await confirm({ title: 'Delete this segment?', message: `“${def.name}” and its efforts go. If it came from a suggestion, the suggestion is offered again.`, confirm: 'Delete', danger: true }))) onDelete(def); };
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
  const fields = FIELDS.filter((f) => rule.shape.type === 'route' || !f.key.startsWith('route'));
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <aside ref={box} tabIndex={-1} className="sheet wide" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <span style={{ flex: 1 }} />
          <button className="btn icon" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <RuleBuilder initial={rule as Rule} initialName={kept || def.name ? def.name : undefined} options={options} handle={handle} tolerances={tol} footer={(s) => (
          <>
            <button className="btn primary" disabled={!s.segments} onClick={() => onSave({ ...one, name: s.name, params: { type: 'rule', ...s.rule }, tolerances: tol })}>{kept ? 'Save & find again' : 'Save segment'}</button>
            {kept && onDelete && <button className="btn danger" onClick={remove}>Delete segment</button>}
          </>
        )}>
          <details className="builder-section matching-checks">
            <summary>Matching checks <span className="muted small">· what every effort is checked for besides the rule; empty: not checked</span></summary>
            {fields.map((f) => (
              <label key={f.key} className="field">
                <span>{f.label}</span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input aria-label={f.label} defaultValue={show(f)} placeholder="–" onBlur={(e) => setTol({ ...tol, [f.key]: parse(f, e.target.value) } as Tolerances)} style={{ width: 80 }} />
                  <span className="muted small" style={{ width: 28 }}>{f.unit}</span>
                </span>
              </label>
            ))}
            {/* The start is the rule's (More, above); an older block's own check shows here while it is set. */}
            {tol.start !== 'any' && <label className="field">
              <span>Start of every effort</span>
              <select aria-label="Start of every effort" value={tol.start} onChange={(e) => setTol({ ...tol, start: e.target.value as BlockStart })}>
                <option value="any">any</option>
                <option value="standing">standing (right after a stop)</option>
                <option value="flying">flying (on the move)</option>
              </select>
            </label>}
          </details>
        </RuleBuilder>
      </aside>
      {confirmDialog}
    </div>
  );
}
