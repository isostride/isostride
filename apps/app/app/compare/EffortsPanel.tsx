'use client';

import { useState } from 'react';
import { useMetrics, eager } from '@/components';
import type { BlockInstance, BlockMetric } from '@/lib/blocks';
import { reasonSummary, selectInstances, valueOf } from '@/lib/compare';
import type { DataFolder } from '@/lib/fs';
import { t } from '@/lib/i18n';

const EffortsChart = eager(() => import('./EffortsChart').then((m) => m.EffortsChart));
const SegmentsTable = eager(() => import('./SegmentsTable').then((m) => m.SegmentsTable), () => <div className="muted small" style={{ padding: 18 }}>{t('Loading the efforts…')}</div>);

const keyOfEffort = (e: BlockInstance) => `${e.runId}:${e.start}`;

/**
 * The Efforts tab of Compare: one segment's efforts for one metric, by date or ranked, the ones
 * chosen drawn over each other by distance. Loaded with the tab, so the page's own script stays small.
 */
export function EffortsPanel({ blocks, item, onItem, all, metric, reference, titleOf, computing, similarHref, handle, folder }: {
  blocks: { id: string; defId: string; label: string }[];
  /** the segment shown; the first when none is chosen */
  item: string | null;
  onItem: (id: string) => void;
  all: BlockInstance[];
  /** the metric at first: the first one of the Trends tab */
  metric: BlockMetric;
  /** the part compared from, when Compare was opened from one */
  reference: { runId: string; from: number; to: number } | null;
  titleOf: (runId: string) => string | null;
  computing: boolean;
  similarHref: (e: BlockInstance) => string;
  handle: FileSystemDirectoryHandle;
  folder: DataFolder;
}) {
  const { view, blockKeys } = useMetrics();
  const [tableMetric, setTableMetric] = useState<BlockMetric | null>(null);
  const [sort, setSort] = useState<'date' | 'best' | 'worst'>('date');
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [top, setTop] = useState(10);

  const tableFor = blocks.find((i) => i.id === item) ?? blocks[0];
  if (!tableFor) return null;
  /** True for the effort that is the part compared from: in its run, over at least half of it. */
  const isReference = (e: BlockInstance) => !!reference && e.runId === reference.runId && Math.min(e.end, reference.to) - Math.max(e.start, reference.from) > 0.5 * (reference.to - reference.from);
  const tableKey = tableMetric ?? metric;
  const tableView = view(tableKey);
  const selection = selectInstances(all, tableFor.defId, tableKey);
  // Best first by the metric's direction (requirement "Metric direction set by the runner"); with none, highest first.
  const ranked = tableView.direction !== 'neutral';
  const lowerBetter = tableView.direction === 'lower';
  const segments = selection.included.map((i) => ({ i, v: valueOf(i, tableKey)! }));
  // Drawn on the overlay: the efforts chosen; at first the part compared from with the two newest others.
  const byKey = new Map(segments.map(({ i }) => [keyOfEffort(i), i]));
  const firstChoice = () => {
    const ref = segments.find(({ i }) => isReference(i));
    if (!ref) return [];
    const others = segments.filter(({ i }) => i !== ref.i).map(({ i }) => i).sort((a, b) => b.runStart.localeCompare(a.runStart)).slice(0, 2);
    return [ref.i, ...others].map(keyOfEffort);
  };
  const chosen = picked[tableFor.id] ?? firstChoice();
  const drawn = chosen.flatMap((k) => { const e = byKey.get(k); return e ? [{ runId: e.runId, from: e.start, to: e.end, reference: isReference(e) }] : []; });
  const tableRows = sort === 'date' ? [...segments].reverse() : [...segments].sort((a, b) => ((sort === 'best') === lowerBetter ? a.v - b.v : b.v - a.v)).slice(0, top);

  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <div className="toolbar" style={{ padding: '12px 18px 0' }}>
        <span className="chart-title" style={{ margin: 0 }}>{t('Efforts')}</span>
        {blocks.length > 1 && (
          <select className="select small" aria-label={t('Segment')} value={tableFor.id} onChange={(e) => onItem(e.target.value)}>
            {blocks.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
          </select>
        )}
        <select className="select small" aria-label={t('Table metric')} value={tableKey} onChange={(e) => setTableMetric(e.target.value as BlockMetric)}>
          {blockKeys.map((k) => <option key={k} value={k}>{view(k).short}</option>)}
        </select>
        <div className="segmented" role="radiogroup" aria-label={t('Order')}>
          {([['date', t('By date')], ['best', ranked ? t('Best first') : t('Highest first')], ['worst', ranked ? t('Worst first') : t('Lowest first')]] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={sort === k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{l}</button>)}
        </div>
        {sort !== 'date' && (
          <select className="select small" aria-label={t('Top')} value={top} onChange={(e) => setTop(Number(e.target.value))}>
            {[5, 10, 20, 50].map((n) => <option key={n} value={n}>{t('top {n}', { n })}</option>)}
          </select>
        )}
        <span className="muted small">{selection.rejected.length ? t('{in} in · {out} left out: {reasons}', { in: segments.length, out: selection.rejected.length, reasons: reasonSummary(selection.rejected).join(', ') }) : t('{in} in · {out} left out', { in: segments.length, out: 0 })}</span>
      </div>
      {/* The efforts chosen, drawn over each other by distance ("tak" to the overlay for any segment's efforts). */}
      {drawn.length > 0 && <EffortsChart efforts={drawn} handle={handle} folder={folder} />}
      <SegmentsTable rows={tableRows} ranked={sort !== 'date'} lowerBetter={lowerBetter} metricName={tableView.name} fmt={tableView.fmt} titleOf={titleOf} computing={computing}
        similarHref={similarHref}
        chosen={chosen} onToggle={(e) => { const k = keyOfEffort(e); setPicked((p) => ({ ...p, [tableFor.id]: chosen.includes(k) ? chosen.filter((x) => x !== k) : chosen.length >= 4 ? chosen : [...chosen, k] })); }}
        isReference={isReference} />
    </div>
  );
}
