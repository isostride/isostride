'use client';

import Link from 'next/link';
import { useState } from 'react';
import { reasonText, type BlockInstance } from '@/lib/blocks';
import type { Rejected } from '@/lib/compare';
import { dateText, msg, number, t } from '@/lib/i18n';
import { minSec } from '@/lib/kernel';

const fmtPace = (s: number) => minSec(s);
const day = (iso: string) => dateText(iso, { day: 'numeric', month: 'short', year: 'numeric' });
/** The source of the heart rate: a strap by its name, or the watch's wrist sensor ("wrist (COROS PACE 4)", as the context names it). */
const hrFrom = (source: string) => { const m = /^wrist \((.*)\)$/.exec(source); return m ? t('wrist ({device})', { device: m[1] }) : source; };

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
        <h3 style={{ margin: 0 }}>{t('Efforts')}</h3>
        <span style={{ flex: 1 }} />
        <button className="btn icon" aria-label={t('Close')} onClick={onClose}>✕</button>
      </div>
      <div className="segmented" style={{ marginBottom: 10 }}>
        <button className={tab === 'accepted' ? 'on' : ''} onClick={() => setTab('accepted')}>{t('Accepted {n}', { n: included.length })}</button>
        <button className={tab === 'rejected' ? 'on' : ''} onClick={() => setTab('rejected')}>{t('Rejected {n}', { n: rejected.length })}</button>
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
                <div className="muted small">✗ {r.reasons.map(reasonText).join(' · ')}</div>
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
    [msg('Effort'), [[msg('pace'), `${fmtPace(c.block.pace)} /km`], [msg('duration'), `${number(Math.round(c.block.duration / 60 * 10) / 10)} min`], [msg('grade'), pct(c.block.grade)], [msg('steadiness CV'), number(c.block.cv)], [msg('stopped'), c.block.stopped ? t('{s} s (left out)', { s: number(c.block.stopped) }) : '–'], [msg('heading'), c.block.heading === null ? '–' : `${number(c.block.heading)}°`]]],
    [msg('Before'), [[msg('minute of run'), number(c.before.minuteOfRun)], [msg('km of run'), number(c.before.kmOfRun)], [msg('effort 2 min before'), pct(c.before.effortBefore)], [msg('lap'), c.before.lap === null || c.before.lap === undefined ? '–' : number(c.before.lap)]]],
    [msg('Run'), [[msg('watch'), c.run.device], [msg('shoes'), c.run.shoes ?? '–'], [msg('heart rate'), hrFrom(c.run.heartRateSource)], [msg('workout'), c.run.workoutType ?? '–'], [msg('cue'), c.run.techniqueCue ?? '–']]],
    [msg('Day'), [[msg('load 3 d'), number(c.day.load3)], [msg('load 7 d'), number(c.day.load7)], [msg('form'), c.day.form === undefined ? '–' : `${c.day.form > 0 ? '+' : ''}${number(c.day.form)}`], [msg('temperature'), c.day.temperature === null ? '–' : `${number(c.day.temperature)} °C`]]],
  ];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 8 }}>
        <b>{day(i.runStart)} · min {Math.floor(i.start / 60)}–{Math.ceil(i.end / 60)}</b>
        <span style={{ flex: 1 }} />
        <Link href={`/run?id=${i.runId}`} className="muted small">{t('Open run →')}</Link>
      </div>
      <div className="ctx-grid">
        {groups.map(([title, rows]) => (
          <div key={title} className="ctx">
            <div className="ctx-title">{t(title)}</div>
            {rows.map(([k, v]) => <div key={k} className="ctx-row"><span className="muted">{t(k)}</span><span>{v}</span></div>)}
          </div>
        ))}
      </div>
    </div>
  );
}
