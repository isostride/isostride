'use client';

import { useState } from 'react';
import { Expandable, eager } from '@/components';
import type { BlockInstance, BlockMetric } from '@/lib/blocks';
import { reasonSummary, selectInstances } from '@/lib/compare';
import type { DataFolder } from '@/lib/fs';
import { t } from '@/lib/i18n';
import { date, time } from '@/lib/format';

const EffortsChart = eager(() => import('./EffortsChart').then((m) => m.EffortsChart));
const EffortsByRun = eager(() => import('./EffortsByRun').then((m) => m.EffortsByRun), () => <div className="muted small" style={{ padding: 18 }}>{t('Loading the efforts…')}</div>);


/**
 * The Efforts tab of Compare: one segment's efforts by run, as a table sorted by its heads or a chart of runs; the ones
 * chosen drawn over each other by distance. Loaded with the tab, so the page's own script stays small.
 */
export function EffortsPanel({ blocks, item, onItem, all, metric, metrics, reference, titleOf, computing, handle, folder }: {
  blocks: { id: string; defId: string; label: string }[];
  /** the segment shown; the first when none is chosen */
  item: string | null;
  onItem: (id: string) => void;
  all: BlockInstance[];
  /** the metric at first: the first one of the Trends tab */
  metric: BlockMetric;
  /** the metrics chosen above the tabs: the table's columns and the chart's lines */
  metrics: BlockMetric[];
  /** the part compared from, when Compare was opened from one */
  reference: { runId: string; from: number; to: number } | null;
  titleOf: (runId: string) => string | null;
  computing: boolean;
  handle: FileSystemDirectoryHandle;
  folder: DataFolder;
}) {
  /** the runs drawn on the chart, by segment ("Wybór biegów"); none chosen yet: the newest and the one before */
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  // A table or a chart ("chce toogle ... tabela/wykres").
  const [mode, setMode] = useState<'table' | 'chart'>('table');

  const tableFor = blocks.find((i) => i.id === item) ?? blocks[0];
  if (!tableFor) return null;
  /** True for the effort that is the part compared from: in its run, over at least half of it. */
  const isReference = (e: BlockInstance) => !!reference && e.runId === reference.runId && Math.min(e.end, reference.to) - Math.max(e.start, reference.from) > 0.5 * (reference.to - reference.from);
  const selection = selectInstances(all, tableFor.defId, metric);
  const segments = selection.included.map((i) => ({ i }));
  // The chart: the runs chosen, each one line, the mean of its efforts; at first the run of the part compared from with
  // the two newest others, else the newest run and the one before.
  const runList = [...new Map([...segments].sort((a, b) => b.i.runStart.localeCompare(a.i.runStart)).map(({ i }) => [i.runId, i.runStart])).entries()].map(([id, start]) => ({ id, start }));
  const refRun = segments.find(({ i }) => isReference(i))?.i.runId;
  const firstRuns = refRun ? [refRun, ...runList.filter((r) => r.id !== refRun).slice(0, 2).map((r) => r.id)] : runList.slice(0, 2).map((r) => r.id);
  const chartRuns = picked[tableFor.id] ?? firstRuns;
  const toggleRun = (id: string) => setPicked((p) => ({ ...p, [tableFor.id]: chartRuns.includes(id) ? (chartRuns.length > 1 ? chartRuns.filter((x) => x !== id) : chartRuns) : chartRuns.length >= 4 ? chartRuns : [...chartRuns, id] }));
  // Runs added whole: each run drawn whole, from its first lap to its last; not its laps averaged, a warm-up over the reps
  // over a cool-down ("w czartach sie cos dziwnego dzieje").
  const whole = tableFor.defId.startsWith('~');
  const chosenEfforts = segments.filter(({ i }) => chartRuns.includes(i.runId)).map(({ i }) => i);
  const toDraw = whole
    ? chartRuns.flatMap((id) => { const xs = chosenEfforts.filter((i) => i.runId === id); return xs.length ? [{ runId: id, from: Math.min(...xs.map((i) => i.start)), to: Math.max(...xs.map((i) => i.end)), reference: false, group: id }] : []; })
    : chosenEfforts.map((i) => ({ runId: i.runId, from: i.start, to: i.end, reference: isReference(i), group: i.runId }));
  // The metrics chosen above the tabs ("moze daj je powyzej"): the table's columns, after the time and the distance, and the chart's lines.
  // i18n-ignore: figure keys
  const cols = [...(metrics.includes('speed') ? ['pace'] : []), 'time', 'distance', ...metrics.filter((m) => m !== 'speed')];

  return (
    <Expandable className="card efforts-card" title={t('Efforts')} style={{ overflowX: 'auto' }}>
      <div className="toolbar" style={{ padding: '12px 18px 0' }}>
        {/* No title: the tab above names it ("usun tytul: Wysilki... bo jest juz u gory"). */}
        {/* The view first, on the left ("tabela/wykres daj na pierwszym miejscu"); the table sorted by its heads ("sortowanie na headerze kolumn"). */}
        <div className="segmented" role="radiogroup" aria-label={t('View')}>
          {([['table', t('Table')], ['chart', t('Chart')]] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={mode === k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}
        </div>
        {blocks.length > 1 && (
          <select className="select small" aria-label={t('Segment')} value={tableFor.id} onChange={(e) => onItem(e.target.value)}>
            {blocks.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
          </select>
        )}
        <span className="spacer" />
        <span className="muted small">{selection.rejected.length ? t('{in} in · {out} left out: {reasons}', { in: segments.length, out: selection.rejected.length, reasons: reasonSummary(selection.rejected).join(', ') }) : t('{in} in · {out} left out', { in: segments.length, out: 0 })}</span>
      </div>
      {/* The chart: the efforts drawn over each other by distance ("tak" to the overlay for any segment's efforts), its lines the figures chosen above. */}
      {mode === 'chart' && (
        <div className="metric-picker reps-metrics" role="group" aria-label={t('Runs drawn')} style={{ padding: '0 18px' }}>
          {runList.map((r) => { const on = chartRuns.includes(r.id); const sameDay = runList.filter((x) => date(x.start) === date(r.start)).length > 1; return <button key={r.id} type="button" className={`pill ${on ? 'on' : ''}`} aria-pressed={on} disabled={!on && chartRuns.length >= 4} title={!on && chartRuns.length >= 4 ? t('At most 4 at once') : titleOf(r.id) ?? undefined} onClick={() => toggleRun(r.id)}>{date(r.start)}{sameDay ? ` · ${time(r.start)}` : ''}</button>; })}
        </div>
      )}
      {mode === 'chart' && toDraw.length > 0 && <EffortsChart efforts={toDraw} handle={handle} folder={folder} metrics={metrics} />}
      {/* The chart alone ("tryb wykres i tak wyswietla tabele"), its runs chosen above it ("Wybór biegów"). */}
      {mode === 'table' && (
        <EffortsByRun key={tableFor.id} efforts={all.filter((e) => e.definitionId === tableFor.defId)} columns={cols} titleOf={titleOf} isReference={isReference} totals={tableFor.defId.startsWith('~')} />
      )}
    </Expandable>
  );
}
