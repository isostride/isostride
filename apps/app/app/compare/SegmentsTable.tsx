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
export function SegmentsTable({ rows, ranked, lowerBetter, metricName, fmt, titleOf, computing, similarHref, chosen, onToggle, isReference }: {
  rows: { i: BlockInstance; v: number }[];
  /** sorted best or worst first: the rows carry their rank */
  ranked: boolean;
  lowerBetter: boolean;
  metricName: string;
  fmt: (v: number) => string;
  titleOf: (runId: string) => string | null;
  computing: boolean;
  /** the Similar tab with an effort as its reference */
  similarHref: (i: BlockInstance) => string;
  /** the efforts drawn on the overlay, by their key (run:start), in order */
  chosen: string[];
  onToggle: (i: BlockInstance) => void;
  /** the effort that is the selection compared from */
  isReference: (i: BlockInstance) => boolean;
}) {
  const [vMin, vMax] = [Math.min(...rows.map((r) => r.v)), Math.max(...rows.map((r) => r.v))];
  const goodness = (v: number) => (vMax > vMin ? 0.12 + (0.88 * (lowerBetter ? vMax - v : v - vMin)) / (vMax - vMin) : 1);
  return (
    <table className="data" aria-label="Efforts">
      <thead><tr><th><span className="sr-only">Draw</span></th>{ranked && <th>#</th>}<th>Date</th><th className="wide-col">Title</th><th className="num">{metricName}</th><th className="wide-col">In the run</th><th /></tr></thead>
      <tbody>
        {rows.map(({ i, v }, k) => (
          <tr key={i.id} className={isReference(i) ? 'reference' : chosen.includes(`${i.runId}:${i.start}`) ? 'on' : ''}>
            <td>
              <label className="similar-pick" title={chosen.length >= 4 && !chosen.includes(`${i.runId}:${i.start}`) ? 'At most 4 at once' : 'Draw it on the chart above'}>
                <input type="checkbox" checked={chosen.includes(`${i.runId}:${i.start}`)} disabled={chosen.length >= 4 && !chosen.includes(`${i.runId}:${i.start}`)} onChange={() => onToggle(i)} aria-label={`Draw ${date(i.runStart)}`} />
              </label>
            </td>
            {ranked && <td><span className={`rank${k < 3 ? ' top' : ''}`}>{k + 1}</span></td>}
            <td className="strong">{date(i.runStart)}{isReference(i) && <span className="chip ref-chip">your selection</span>}</td>
            <td className="wide-col">{titleOf(i.runId) ?? <span className="muted">–</span>}</td>
            <td className="num strong"><CellBar share={goodness(v)} />{fmt(v)}</td>
            <td className="muted wide-col">{mmss(i.start)}–{mmss(i.end)} · {(i.distance / 1000).toFixed(2)} km</td>
            <td className="num row-actions"><Link className="row-open" href={similarHref(i)} title="The efforts like this one in your other runs">Similar</Link> <Link className="row-open" href={`/run?id=${i.runId}&from=${i.start}&to=${i.end}`}>Open run →</Link></td>
          </tr>
        ))}
        {!rows.length && <tr><td colSpan={7} className="muted small">{computing ? 'Reading the runs…' : 'No effort has a value for this metric.'}</td></tr>}
      </tbody>
    </table>
  );
}
