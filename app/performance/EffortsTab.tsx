'use client';

import Link from 'next/link';
import type { RunsIndex } from '@/lib/kernel';
import { MARKER_DAYS, type BestEffort, type Effort, type PerformanceNow } from '@/lib/load';
import { date, pace as fmtPace } from '@/lib/format';
import { CellBar } from '@/components';
import { runHref } from '../compare/links';

const EFFORT_LABEL: Record<Effort, string> = { allout: 'all-out', hard: 'hard, not all-out', easy: 'not all-out', unknown: 'no heart rate' };

function Table({ label, efforts, format, maxHr, runs }: { label: string; efforts: (BestEffort | null)[]; format: (v: number) => string; maxHr: number | null; runs: RunsIndex['runs'] }) {
  const title = new Map(runs.map((r) => [r.id, r.title ?? null]));
  return (
    <div className="table-scroll">
      <table className="data efforts-table" aria-label={label}>
        <thead><tr><th>Length</th><th className="num">Best</th><th>Effort</th><th className="num">Of max heart rate</th><th>Run</th></tr></thead>
        <tbody>
          {efforts.map((e, k) => (e === null ? null : (
            <tr key={k} data-effort={e.effort}>
              <td className="strong">{e.duration / 60} min</td>
              <td className="num tnum strong">{format(e.value)}</td>
              <td><span className="trust"><i className={`trust-dot ${e.effort}`} aria-hidden="true" />{EFFORT_LABEL[e.effort]}</span></td>
              <td className="num tnum muted">{e.hr !== null && maxHr ? <><CellBar share={e.hr / maxHr} />{Math.round((e.hr / maxHr) * 100)} %</> : '–'}</td>
              <td><Link href={runHref(e.runId, e.at?.[0], e.at?.[1])}>{date(e.startTime)}{title.get(e.runId) ? ` · ${title.get(e.runId)}` : ''} →</Link></td>
            </tr>
          )))}
          {efforts.every((e) => e === null) && <tr><td colSpan={5} className="muted small">No best in the last {MARKER_DAYS} days.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The best efforts the curve models are fitted to (requirement "Model assumptions checked"): for
 * each length the best of the last 90 days, how hard it was, and the run it comes from (the link
 * opens the run with the stretch selected). What "all-out" rests on is behind the view's "Why?".
 */
export function EffortsTab({ now, runs }: { now: PerformanceNow; runs: RunsIndex['runs'] }) {
  return (
    <>
      <div className="card chart">
        <h3 className="chart-title">Best pace of each length</h3>
        <Table label="Best pace efforts" efforts={now.efforts} format={(v) => `${fmtPace(v)} /km`} maxHr={now.maxHr} runs={runs} />
      </div>
      {now.powerEfforts.some((e) => e !== null) && (
        <div className="card chart" style={{ marginTop: 12 }}>
          <h3 className="chart-title">Best power of each length</h3>
          <Table label="Best power efforts" efforts={now.powerEfforts} format={(v) => `${Math.round(v)} W`} maxHr={now.maxHr} runs={runs} />
        </div>
      )}
    </>
  );
}
