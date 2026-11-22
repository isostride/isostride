'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { asRule, shapeName, type BlockDefinition, type BlockParams, type Recommendation, type Tolerances } from '@/lib/blocks';
import type { AnalysisItem } from '@/lib/compare';
import type { RunsIndex } from '@/lib/kernel';
import { runName } from './names';

/** The stretch a block takes, in words: its kind in the one model. */
const kindOf = (d: { params: BlockParams; tolerances: Tolerances }) => shapeName(asRule(d.params, d.tolerances).shape);


type Option =
  | { kind: 'block'; id: string; text: string; hint: string }
  | { kind: 'suggested'; id: string; text: string; hint: string; rec: Recommendation }
  | { kind: 'run'; id: string; text: string; hint: string };

const GROUP: Record<Option['kind'], string> = { block: 'Your blocks', suggested: 'Suggested, found in your runs', run: 'Runs' };

/**
 * The picker of the Analysis screen (requirement "Blocks defined in Analysis"): a new block
 * built from a rule, or one of the runner's kept blocks, a block the app found in the runs, or
 * a single run, from a searchable list (the arrow keys move, Enter adds).
 */
export function AddDialog({ defs, recs, runs, items, onAdd, onAccept, onDismiss, onClose }: {
  defs: BlockDefinition[]; recs: Recommendation[]; runs: RunsIndex['runs']; items: AnalysisItem[];
  onAdd: (kind: 'block' | 'run', id: string) => void;
  /** a suggested block taken: it is kept and added */
  onAccept: (rec: Recommendation) => void;
  /** a suggested block the runner does not want proposed again */
  onDismiss: (rec: Recommendation) => void;
  onClose: () => void;
}) {
  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" role="dialog" aria-label="Add block or run" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <ListTab defs={defs} recs={recs} runs={runs} items={items} onAdd={onAdd} onAccept={onAccept} onDismiss={onDismiss} />
        {/* One way to make a block (requirement "One way to make a block"): the editor of the Blocks screen. */}
        <div className="palette-foot"><Link className="btn sm" href="/blocks?new=1">New block…</Link><span className="muted small">made on the Blocks screen, then added here from this list</span></div>
      </div>
    </div>
  );
}

function ListTab({ defs, recs, runs, items, onAdd, onAccept, onDismiss }: {
  defs: BlockDefinition[]; recs: Recommendation[]; runs: RunsIndex['runs']; items: AnalysisItem[];
  onAdd: (kind: 'block' | 'run', id: string) => void; onAccept: (rec: Recommendation) => void; onDismiss: (rec: Recommendation) => void;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const match = (text: string) => words.every((w) => text.toLowerCase().includes(w));
  const list: Option[] = [
    ...defs.filter((d) => !items.some((i) => i.id === d.id) && match(`${d.name} block ${kindOf(d)}`)).map((d): Option => ({ kind: 'block', id: d.id, text: d.name, hint: kindOf(d) })),
    ...recs.filter((r) => match(`${r.name} suggested ${kindOf(r)}`)).map((r): Option => ({ kind: 'suggested', id: r.id, text: r.name, hint: r.basis, rec: r })),
    ...[...runs].reverse().filter((r) => !items.some((i) => i.id === r.id))
      .filter((r) => match(`${runName(r.startTime, r.distance, r.title)} ${r.workoutType ?? ''} ${r.startTime.slice(0, 10)} run`))
      .map((r): Option => ({ kind: 'run', id: r.id, text: runName(r.startTime, r.distance, r.title), hint: [r.workoutType, `${Math.floor(r.duration / 60)} min`].filter(Boolean).join(' · ') })),
  ].slice(0, 80);
  const choose = (o: Option) => (o.kind === 'suggested' ? onAccept(o.rec) : onAdd(o.kind, o.id));
  return (
    <>
      <input ref={input} value={q} placeholder="Search your blocks, suggestions and runs…" aria-label="Search blocks and runs"
        onChange={(e) => { setQ(e.target.value); setActive(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(list.length - 1, a + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === 'Enter' && list[active]) choose(list[active]);
        }} />
      <ul className="palette-list" aria-label="Blocks and runs">
        {list.map((o, k) => (
          <li key={o.kind + o.id}>
            {(k === 0 || list[k - 1].kind !== o.kind) && <div className="palette-group">{GROUP[o.kind]}</div>}
            <div className="palette-row">
              <button type="button" className={`palette-item ${k === active ? 'on' : ''}`} onMouseEnter={() => setActive(k)} onClick={() => choose(o)}>
                <span>{o.text}</span>
                <span className="muted small">{o.hint}</span>
              </button>
              {o.kind === 'suggested' && <button type="button" className="btn sm" aria-label={`Dismiss ${o.text}`} title="Do not suggest this block again" onClick={() => onDismiss(o.rec)}>Dismiss</button>}
            </div>
          </li>
        ))}
        {!list.length && <li className="muted small" style={{ padding: 12 }}>Nothing found. Build a block on the New block tab.</li>}
      </ul>
    </>
  );
}
