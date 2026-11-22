'use client';

import Link from 'next/link';
import { ItemKey, METRIC_VIEW } from '@/components';
import { changesByMetric, describeDelta, describeTrend, formatAmount, percentChange, type TrendResult } from '@/lib/compare';
import type { BlockInstance, BlockMetric } from '@/lib/blocks';

const view = (mt: BlockMetric) => METRIC_VIEW.find((x) => x.key === mt)!;

/** A segment of the comparison as the verdicts show it. */
export interface VerdictRow {
  id: string;
  /** the id its efforts carry */
  defId: string;
  label: string;
  shape: Parameters<typeof ItemKey>[0]['shape'];
  color: string;
  attributes: string[];
  abHref: string;
  /** its efforts are still being read */
  pending: boolean;
}

/**
 * The verdicts of the Trends tab of Compare, under its charts: the table of changes (a row per
 * segment, a cell per metric: the fitted change, whether it is beyond the noise, the efforts it rests
 * on) and each segment's verdicts in words. Loaded with the tab, so the screen's own script stays
 * within its budget (ADR "Built with React": 200 KB of script per route).
 */
export function TrendVerdicts({ rows, metrics, all, corrected, trendsBy }: {
  rows: VerdictRow[];
  metrics: BlockMetric[];
  all: BlockInstance[];
  corrected: boolean;
  trendsBy: Map<BlockMetric, Map<string, TrendResult>>;
}) {
  return (
    <>
      {rows.length > 0 && (
        <div className="card" style={{ marginTop: 12, overflowX: 'auto' }}>
          <table className="data changes" aria-label="Changes">
            <thead>
              <tr><th>Segment</th>{metrics.map((mt) => <th key={mt}>{view(mt).short}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id}>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ItemKey shape={i.shape} color={i.color} />{i.label}</span>
                    <div className="attrs">
                      {i.attributes.map((a) => <span key={a} className="chip">{a}</span>)}
                      <Link className="muted small" href={i.abHref}>Compare A/B →</Link>
                    </div>
                  </td>
                  {i.pending
                    ? metrics.map((mt) => <td key={mt}><span className="muted small">…</span></td>)
                    : changesByMetric(all, i.defId, metrics, corrected).map((c) => (
                      <td key={c.metric}>
                        {c.change === null ? (
                          <span className="muted small">{c.n ? `${c.n} efforts, too few` : 'no efforts'}</span>
                        ) : (
                          <div className="kpi">
                            <div className={`kpi-v ${c.verdict === 'change' ? 'change-yes' : ''}`}>{describeDelta(c.metric, c.change)}{c.start ? <span className="kpi-pct">{percentChange(c.change, c.start)}</span> : null}</div>
                            <div className="kpi-sub muted small"><span className={`verdict-chip ${c.verdict === 'change' ? 'yes' : 'no'}`}>{c.verdict === 'change' ? 'change' : 'no detectable change'}</span> · noise ±{formatAmount(c.metric, c.noise!)} · {c.n} efforts</div>
                          </div>
                        )}
                      </td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="chart-note" style={{ padding: '0 12px 10px' }}>Each cell: the fitted change from the first to the last effort, whether it is beyond the noise, and the efforts it rests on.</div>
        </div>
      )}

      {rows.map((i) => (
        <details key={i.id} className="card result" style={{ marginTop: 12 }}>
          <summary><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ItemKey shape={i.shape} color={i.color} />{i.label}: the verdicts in words</span></summary>
          {metrics.flatMap((mt) => (trendsBy.get(mt)?.get(i.id)?.series ?? []).map((s) => {
            const d = describeTrend(s, mt, view(mt).fmt);
            return (
              <div key={mt + s.source} className="result-row">
                <div className="muted small">{view(mt).name}{(trendsBy.get(mt)?.get(i.id)?.series.length ?? 0) > 1 ? ` · ${s.source}` : ''}</div>
                <div className={`verdict ${d.change ? 'is-change' : ''}`}>{d.headline}</div>
                <div className="explain">{d.sentence}</div>
              </div>
            );
          }))}
        </details>
      ))}
    </>
  );
}
