'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { asRule, basisOf, shapeName, shownSuggestionName, type BlockDefinition, type BlockParams, type Recommendation, type Tolerances } from '@/lib/blocks';
import type { AnalysisItem } from '@/lib/compare';
import { msg, t } from '@/lib/i18n';
import type { RunsIndex } from '@/lib/kernel';
import { runName, segmentName } from './names';

/** The stretch a block takes, in words: its kind in the one model. */
const kindOf = (d: { params: BlockParams; tolerances: Tolerances }) => shapeName(asRule(d.params, d.tolerances).shape);


type Option =
  | { kind: 'block'; id: string; text: string; hint: string }
  | { kind: 'suggested'; id: string; text: string; hint: string; rec: Recommendation }
  | { kind: 'run'; id: string; text: string; hint: string }
  | { kind: 'rule'; id: string; text: string; hint: string };

const GROUP: Record<Option['kind'], string> = { rule: msg('Every run'), block: msg('Your segments'), suggested: msg('Suggested, found in your runs'), run: msg('Runs') };

/**
 * The picker of the Analysis screen (requirement "Blocks defined in Analysis"): a new block
 * built from a rule, or one of the runner's kept blocks, a block the app found in the runs, or
 * a single run, from a searchable list (the arrow keys move, Enter adds).
 */
export function AddDialog({ defs, recs, runs, items, allRuns, onAdd, onAccept, onDismiss, onClose }: {
  defs: BlockDefinition[]; recs: Recommendation[]; runs: RunsIndex['runs']; items: AnalysisItem[];
  /** the item of every run, whole (a rule with nothing set) */
  allRuns: string;
  onAdd: (kind: 'block' | 'run' | 'rule', id: string) => void;
  /** a suggested block taken: it is kept and added */
  onAccept: (rec: Recommendation) => void;
  /** a suggested block the runner does not want proposed again */
  onDismiss: (rec: Recommendation) => void;
  onClose: () => void;
}) {
  return (
    // The look of the command palette (components/CommandPalette): a search with its glyph, groups with
    // their counts, each option with the glyph of its kind ("panel add compare .. wyglada biednie").
    <div className="palette-backdrop cmdk-backdrop" onClick={onClose}>
      <div className="cmdk add-picker" role="dialog" aria-modal="true" aria-label={t('Add segment or run')} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <ListTab defs={defs} recs={recs} runs={runs} items={items} allRuns={allRuns} onAdd={onAdd} onAccept={onAccept} onDismiss={onDismiss} onClose={onClose} />
        {/* One way to make a block (requirement "One way to make a block"): the editor of the Segments screen. */}
        <div className="cmdk-foot">
          <span><kbd className="cmdk-kbd">↑</kbd><kbd className="cmdk-kbd">↓</kbd> {t('move')}</span>
          <span><kbd className="cmdk-kbd">↵</kbd> {t('add')}</span>
          {/* i18n-ignore: the key's name, as printed on it */}
          <span><kbd className="cmdk-kbd">esc</kbd> {t('close')}</span>
          <span className="cmdk-foot-end"><Link className="btn sm" href="/segments?new=1">{t('New segment…')}</Link></span>
        </div>
      </div>
    </div>
  );
}

/** The glyph of each kind of option. */
const GLYPH: Record<Option['kind'], string> = {
  rule: 'M4 7h16|M4 12h16|M4 17h16',
  block: 'M4 18c3-8 5-8 8 0s5 8 8 0',
  suggested: 'M12 3v4|M12 17v4|M3 12h4|M17 12h4|M6 6l2.5 2.5|M15.5 15.5L18 18|M6 18l2.5-2.5|M15.5 8.5L18 6',
  run: 'M3 12h4l2-5 4 10 2-5h6',
};

function ListTab({ defs, recs, runs, items, allRuns, onAdd, onAccept, onDismiss, onClose }: {
  defs: BlockDefinition[]; recs: Recommendation[]; runs: RunsIndex['runs']; items: AnalysisItem[]; allRuns: string;
  onAdd: (kind: 'block' | 'run' | 'rule', id: string) => void; onAccept: (rec: Recommendation) => void; onDismiss: (rec: Recommendation) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const match = (text: string) => words.every((w) => text.toLowerCase().includes(w));
  const list: Option[] = [
    // All runs, whole: no longer shown by default, so offered first.
    ...(!items.some((i) => i.id === allRuns) && match(`all runs every run whole ${t('All runs')} ${t('every run, whole')}`) ? [{ kind: 'rule' as const, id: allRuns, text: t('All runs'), hint: t('every run, whole') }] : []),
    ...defs.filter((d) => !items.some((i) => i.id === d.id) && match(`${d.name} ${segmentName(d)} segment ${t('segment')} ${kindOf(d)}`)).map((d): Option => ({ kind: 'block', id: d.id, text: segmentName(d), hint: kindOf(d) })),
    ...recs.filter((r) => match(`${r.name} ${shownSuggestionName(r)} suggested ${t('suggested')} ${kindOf(r)}`)).map((r): Option => ({ kind: 'suggested', id: r.id, text: shownSuggestionName(r), hint: basisOf(r), rec: r })),
    ...[...runs].reverse().filter((r) => !items.some((i) => i.id === r.id))
      .filter((r) => match(`${runName(r.startTime, r.distance, r.title)} ${r.workoutType ?? ''} ${r.startTime.slice(0, 10)} run ${t('run')}`))
      .map((r): Option => ({ kind: 'run', id: r.id, text: runName(r.startTime, r.distance, r.title), hint: [r.workoutType, `${Math.floor(r.duration / 60)} min`].filter(Boolean).join(' · ') })),
  ].slice(0, 80);
  const choose = (o: Option) => (o.kind === 'suggested' ? onAccept(o.rec) : onAdd(o.kind, o.id));
  const count = (kind: Option['kind']) => list.filter((o) => o.kind === kind).length;
  // The option chosen by the keys kept in view.
  const box = useRef<HTMLUListElement>(null);
  useEffect(() => { box.current?.querySelector('.palette-item.on')?.scrollIntoView({ block: 'nearest' }); }, [active]);
  return (
    <>
      <div className="cmdk-head">
        <svg className="cmdk-search" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input ref={input} value={q} placeholder={t('Search your segments, suggestions and runs…')} aria-label={t('Search segments and runs')}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(list.length - 1, a + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === 'Enter' && list[active]) choose(list[active]);
          }} />
        {/* i18n-ignore: the key's name, as printed on it */}
        <button type="button" className="cmdk-esc" onClick={onClose} aria-label={t('Close, esc')}>esc</button>
      </div>
      <ul ref={box} className="cmdk-list palette-list" aria-label={t('Segments and runs')}>
        {list.map((o, k) => (
          <li key={o.kind + o.id}>
            {(k === 0 || list[k - 1].kind !== o.kind) && <div className="cmdk-group palette-group"><span>{t(GROUP[o.kind])}</span><span className="cmdk-count">{count(o.kind)}</span></div>}
            <div className={`palette-row add-${o.kind}`}>
              <button type="button" className={`cmdk-item palette-item ${k === active ? 'on' : ''}`} onMouseEnter={() => setActive(k)} onClick={() => choose(o)}>
                <span className="cmdk-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{GLYPH[o.kind].split('|').map((d) => <path key={d} d={d} />)}</svg>
                </span>
                <span className="cmdk-text"><span className="cmdk-label">{o.text}</span><span className="cmdk-hint">{o.hint}</span></span>
                <span className="cmdk-enter" aria-hidden="true">↵</span>
              </button>
              {o.kind === 'suggested' && <button type="button" className="btn sm add-dismiss" aria-label={t('Dismiss {name}', { name: o.text })} title={t('Do not suggest this segment again')} onClick={() => onDismiss(o.rec)}>{t('Dismiss')}</button>}
            </div>
          </li>
        ))}
        {!list.length && (
          <li className="cmdk-empty">
            <b>{q ? t('Nothing found for “{q}”', { q }) : t('Nothing found')}</b>
            <span>{t('Try another word, or make a segment on the Segments screen.')}</span>
          </li>
        )}
      </ul>
    </>
  );
}
