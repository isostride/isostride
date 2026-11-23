'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { METRIC_VIEW } from '@/components';
import type { BlockInstance, BlockMetric } from '@/lib/blocks';
import { reasonSummary, selectInstances, valueOf } from '@/lib/compare';
import type { DataFolder } from '@/lib/fs';

const EffortsChart = dynamic(() => import('./EffortsChart').then((m) => m.EffortsChart), { ssr: false });
const SegmentsTable = dynamic(() => import('./SegmentsTable').then((m) => m.SegmentsTable), { ssr: false, loading: () => <div className="muted small" style={{ padding: 18 }}>Loading the efforts…</div> });

const view = (mt: BlockMetric) => METRIC_VIEW.find((x) => x.key === mt)!;
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
  const lowerBetter = tableView.invert === true || ['heartRate', 'groundContactTime', 'verticalOscillation'].includes(tableKey);
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
        <span className="chart-title" style={{ margin: 0 }}>Efforts</span>
        {blocks.length > 1 && (
          <select className="select small" aria-label="Segment" value={tableFor.id} onChange={(e) => onItem(e.target.value)}>
            {blocks.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
          </select>
        )}
        <select className="select small" aria-label="Table metric" value={tableKey} onChange={(e) => setTableMetric(e.target.value as BlockMetric)}>
          {METRIC_VIEW.map((x) => <option key={x.key} value={x.key}>{x.short}</option>)}
        </select>
        <div className="segmented" role="radiogroup" aria-label="Order">
          {([['date', 'By date'], ['best', 'Best first'], ['worst', 'Worst first']] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={sort === k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{l}</button>)}
        </div>
        {sort !== 'date' && (
          <select className="select small" aria-label="Top" value={top} onChange={(e) => setTop(Number(e.target.value))}>
            {[5, 10, 20, 50].map((n) => <option key={n} value={n}>top {n}</option>)}
          </select>
        )}
        <span className="muted small">{segments.length} in · {selection.rejected.length} left out{selection.rejected.length ? `: ${reasonSummary(selection.rejected).join(', ')}` : ''}</span>
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
