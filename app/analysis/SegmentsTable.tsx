'use client';

import Link from 'next/link';
import { CellBar } from '@/components';
import type { BlockInstance } from '@/lib/blocks';
import { date } from '@/lib/format';
import { mmss } from './links';

/**
 * The table of the Segments tab (requirement "Tables in one look"): a row per segment of the item
 * chosen, its rank when sorted, its value with a bar (the better, the longer, against the rows
 * shown), its stretch and a link to it in its run. Loaded when the tab opens.
 */
export function SegmentsTable({ rows, ranked, lowerBetter, metricName, fmt, titleOf, computing }: {
  rows: { i: BlockInstance; v: number }[];
  /** sorted best or worst first: the rows carry their rank */
  ranked: boolean;
  lowerBetter: boolean;
  metricName: string;
  fmt: (v: number) => string;
  titleOf: (runId: string) => string | null;
  computing: boolean;
}) {
  const [vMin, vMax] = [Math.min(...rows.map((r) => r.v)), Math.max(...rows.map((r) => r.v))];
  const goodness = (v: number) => (vMax > vMin ? 0.12 + (0.88 * (lowerBetter ? vMax - v : v - vMin)) / (vMax - vMin) : 1);
  return (
    <table className="data" aria-label="Segments">
      <thead><tr>{ranked && <th>#</th>}<th>Date</th><th>Title</th><th className="num">{metricName}</th><th>Stretch</th><th /></tr></thead>
      <tbody>
        {rows.map(({ i, v }, k) => (
          <tr key={i.id}>
            {ranked && <td><span className={`rank${k < 3 ? ' top' : ''}`}>{k + 1}</span></td>}
            <td className="strong">{date(i.runStart)}</td>
            <td>{titleOf(i.runId) ?? <span className="muted">–</span>}</td>
            <td className="num strong"><CellBar share={goodness(v)} />{fmt(v)}</td>
            <td className="muted">{mmss(i.start)}–{mmss(i.end)} · {(i.distance / 1000).toFixed(2)} km</td>
            <td className="num"><Link className="row-open" href={`/run?id=${i.runId}&from=${i.start}&to=${i.end}`}>Open run →</Link></td>
          </tr>
        ))}
        {!rows.length && <tr><td colSpan={6} className="muted small">{computing ? 'Reading the runs…' : 'No segment has a value for this metric.'}</td></tr>}
      </tbody>
    </table>
  );
}
