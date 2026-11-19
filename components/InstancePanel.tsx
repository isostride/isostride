'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { BlockInstance } from '@/lib/blocks';
import type { Rejected } from '@/lib/compare';

const fmtPace = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

interface Props {
  included: BlockInstance[];
  rejected: Rejected[];
  value: (i: BlockInstance) => string;
  focus: BlockInstance | null;
  onFocus: (i: BlockInstance) => void;
  onClose: () => void;
  /** In an A/B comparison: the group of an instance ('A' or 'B') and the label of each group. */
  group?: (i: BlockInstance) => 'A' | 'B' | null;
  groupLabel?: Record<'A' | 'B', string>;
}

/** Side panel over a result: the accepted and rejected instances with reasons, and one instance's four context layers (spec F14). */
export function InstancePanel({ included, rejected, value, focus, onFocus, onClose, group, groupLabel }: Props) {
  const tag = (i: BlockInstance) => {
    const g = group?.(i);
    return g ? <span className={`group-tag g${g}`} title={groupLabel?.[g]}>{g}</span> : null;
  };
  const [tab, setTab] = useState<'accepted' | 'rejected'>('accepted');
  return (
    <aside className="sheet" style={{ zIndex: 21 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Instances</h3>
        <span style={{ flex: 1 }} />
        <button className="btn icon" aria-label="Close" onClick={onClose}>✕</button>
      </div>
      <div className="segmented" style={{ marginBottom: 10 }}>
        <button className={tab === 'accepted' ? 'on' : ''} onClick={() => setTab('accepted')}>Accepted {included.length}</button>
        <button className={tab === 'rejected' ? 'on' : ''} onClick={() => setTab('rejected')}>Rejected {rejected.length}</button>
      </div>
      <div style={{ maxHeight: '38vh', overflow: 'auto', marginBottom: 12 }}>
        {tab === 'accepted'
          ? [...included].reverse().map((i) => (
              <div key={i.id} className={`list-row ${focus?.id === i.id ? 'on' : ''}`} onClick={() => onFocus(i)}>
                <span>{tag(i)}{day(i.runStart)}</span><span className="muted">{fmtPace(i.context.block.pace)} /km</span><b>{value(i)}</b>
              </div>
            ))
          : [...rejected].reverse().map((r) => (
              <div key={r.instance.id} className={`list-row ${focus?.id === r.instance.id ? 'on' : ''}`} onClick={() => onFocus(r.instance)} style={{ display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{tag(r.instance)}{day(r.instance.runStart)}</span><span className="muted">{fmtPace(r.instance.context.block.pace)} /km</span></div>
                <div className="muted small">✗ {r.reasons.join(' · ')}</div>
              </div>
            ))}
      </div>
      {focus && <Context i={focus} />}
    </aside>
  );
}

function Context({ i }: { i: BlockInstance }) {
  const c = i.context;
  const pct = (x: number | null) => (x === null ? '–' : `${x > 0 ? '+' : ''}${Math.round(x * 100)}%`);
  const groups: [string, [string, string][]][] = [
    ['Block', [['pace', `${fmtPace(c.block.pace)} /km`], ['duration', `${Math.round(c.block.duration / 60 * 10) / 10} min`], ['grade', pct(c.block.grade)], ['steadiness CV', String(c.block.cv)], ['stopped', c.block.stopped ? `${c.block.stopped} s (left out)` : '–'], ['heading', c.block.heading === null ? '–' : `${c.block.heading}°`]]],
    ['Before', [['minute of run', String(c.before.minuteOfRun)], ['km of run', String(c.before.kmOfRun)], ['effort 2 min before', pct(c.before.effortBefore)], ['lap', String(c.before.lap ?? '–')]]],
    ['Run', [['watch', c.run.device], ['shoes', c.run.shoes ?? '–'], ['heart rate', c.run.heartRateSource], ['workout', c.run.workoutType ?? '–'], ['cue', c.run.techniqueCue ?? '–']]],
    ['Day', [['load 3 d', `${c.day.load3} min`], ['load 7 d', `${c.day.load7} min`], ['temperature', c.day.temperature === null ? '–' : `${c.day.temperature} °C`]]],
  ];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 8 }}>
        <b>{day(i.runStart)} · min {Math.floor(i.start / 60)}–{Math.ceil(i.end / 60)}</b>
        <span style={{ flex: 1 }} />
        <Link href={`/run?id=${i.runId}`} className="muted small">Open run →</Link>
      </div>
      <div className="ctx-grid">
        {groups.map(([title, rows]) => (
          <div key={title} className="ctx">
            <div className="ctx-title">{title}</div>
            {rows.map(([k, v]) => <div key={k} className="ctx-row"><span className="muted">{k}</span><span>{v}</span></div>)}
          </div>
        ))}
      </div>
    </div>
  );
}
