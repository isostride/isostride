'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { InstancePanel, Key, ProfileChart, useMetrics, ensureSpan, monthLabel, monthTicks, niceTicks, tickDecimals, useWidth } from '@/components';
import type { BlockInstance, BlockMetric } from '@/lib/blocks';
import { unitOf, wordsOf, MIN_AB_INSTANCES, abCsv, byField, computeAb, describeAb, firstUsableMetric, meanProfile, type AbResult, instancesCsv, CONTEXT_FIELDS, valueOf, type ContextField } from '@/lib/compare';

/** Ground contact time first: the A/B screen's usual question is a change of shoes or technique. */

/** An item of Analysis the A/B tab can split: its id in the link, the definition of its instances, its name. */
export interface AbItem {
  id: string;
  defId: string;
  label: string;
}

/**
 * The A/B tab of Analysis (requirements "A/B comparison" and "A/B as a tab of Analysis"): two sets
 * of the segments of one item that differ in one context field. Loaded when the tab opens.
 */
export function AbTab({ items, all, chosen: chosenItem, onChoose, computing }: {
  items: AbItem[];
  /** the instances of the items: kept and computed now */
  all: BlockInstance[];
  /** the item chosen (its id), or null for the first */
  chosen: string | null;
  onChoose: (id: string) => void;
  /** a rule's segments are still being computed */
  computing: boolean;
}) {
  const known = useMetrics();
  // The folder's metrics, ground contact time first ("A/B butow": the shoes show in it).
  const METRICS = useMemo(() => [...known.blockKeys].sort((a, b) => (a === 'groundContactTime' ? -1 : b === 'groundContactTime' ? 1 : 0)).map(known.view), [known]);
  const [chosen, setMetric] = useState<BlockMetric | null>(null);
  const [corrected, setCorrected] = useState(true);
  const [field, setField] = useState<ContextField>('shoes');
  const [pair, setPair] = useState<[string, string] | null>(null);
  const [panel, setPanel] = useState(false);
  const [focus, setFocus] = useState<BlockInstance | null>(null);

  const item = items.find((i) => i.id === chosenItem) ?? items[0];
  const defId = item?.defId ?? '';
  // Opens on ground contact time, or the first metric with accepted instances.
  const metric = useMemo(() => chosen ?? firstUsableMetric(all, defId, METRICS.map((x) => x.key), 2 * MIN_AB_INSTANCES), [chosen, all, defId, METRICS]);
  useEffect(() => setMetric(null), [defId]);
  const m = METRICS.find((x) => x.key === metric)!;
  const mine = useMemo(() => all.filter((i) => i.definitionId === defId && i.status === 'accepted'), [all, defId]);

  /** Values of each field among the accepted instances, most frequent first. */
  const values = useMemo(() => {
    const o = {} as Record<ContextField, string[]>;
    for (const f of Object.keys(CONTEXT_FIELDS) as ContextField[]) {
      const count = new Map<string, number>();
      for (const i of mine) { const v = CONTEXT_FIELDS[f].get(i); if (v) count.set(v, (count.get(v) ?? 0) + 1); }
      o[f] = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
    }
    return o;
  }, [mine]);
  const fields = (Object.keys(CONTEXT_FIELDS) as ContextField[]).filter((f) => values[f].length >= 2);
  const activeField = fields.includes(field) ? field : fields[0];
  const [va, vb] = pair && activeField && values[activeField].includes(pair[0]) && values[activeField].includes(pair[1]) ? pair : activeField ? [values[activeField][0], values[activeField][1]] : ['', ''];

  const result: AbResult | null = useMemo(
    () => (activeField ? computeAb(all, defId, metric, byField(activeField, va, vb), [va, vb], {}, corrected) : null),
    [all, defId, metric, activeField, va, vb, corrected],
  );

  const download = (name: string, text: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!item) return <div className="card empty">A/B splits the efforts of a segment in two: add All runs or a segment with <b>+ Add segment or run</b> (a single run has no two groups).</div>;

  const included = result ? [...result.a.points, ...result.b.points].map((p) => p.instance) : [];
  const base = item.label.replace(/[^\w-]+/g, '_');

  // Drawn once the folder's metrics are read: its buttons would else gain a row and push the tab down (layout shift 0).
  if (!known.ready) return null;
  return (
    <>
      <div className="toolbar">
        {items.length > 1 && (
          <select className="select small" aria-label="Item to split" value={item.id} onChange={(e) => onChoose(e.target.value)}>
            {items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
          </select>
        )}
        <div className="metric-picker" role="group" aria-label="Metric">{METRICS.map((x) => <button key={x.key} className={`pill ${metric === x.key ? 'on' : ''}`} aria-pressed={metric === x.key} title={x.name} onClick={() => setMetric(x.key)}>{x.short}</button>)}</div>
        <div className="segmented">
          <button className={!corrected ? 'on' : ''} onClick={() => setCorrected(false)}>Raw</button>
          <button className={corrected ? 'on' : ''} onClick={() => setCorrected(true)}>Corrected</button>
        </div>
        {fields.length > 0 && (
          <>
            <span className="muted small">Split by</span>
            <select className="select small" aria-label="Split by" value={activeField} onChange={(e) => { setField(e.target.value as ContextField); setPair(null); }}>
              {fields.map((f) => <option key={f} value={f}>{CONTEXT_FIELDS[f].label}</option>)}
            </select>
            <select className="select small" aria-label="Group A" value={va} onChange={(e) => setPair([e.target.value, vb])}>{values[activeField].map((v) => <option key={v}>{v}</option>)}</select>
            <span className="muted small">vs</span>
            <select className="select small" aria-label="Group B" value={vb} onChange={(e) => setPair([va, e.target.value])}>{values[activeField].map((v) => <option key={v}>{v}</option>)}</select>
          </>
        )}
        <span className="spacer" />
        {result && <button className="btn" onClick={() => { download(`${base}-ab.csv`, abCsv(result, item.label)); download(`${base}-ab-instances.csv`, instancesCsv(included)); }}>Export A/B CSV</button>}
        {result && <button className="btn" onClick={() => setPanel(true)}>Efforts: {included.length} in · {result.rejected.length} left out</button>}
      </div>

      {!result ? (
        <div className="card empty">
          {computing ? 'Reading the runs…' : 'No context field splits this item’s efforts yet.'} Register two pairs of shoes (or tag runs) in the Gear tab of <Link href="/settings?tab=gear">Settings</Link>; each effort carries the shoes of its run.
        </div>
      ) : (
        <>
          {result.warnings.map((w) => <div key={w} className="banner warn">⚠ {w}</div>)}
          {(() => {
            const d = describeAb(result, metric, MIN_AB_INSTANCES, wordsOf(metric, known.catalog, known.directions));
            return (
              <div className="card result">
                <div className="muted small">{m.name}{corrected ? ' · corrected for pace' : ''} · {result.b.label} against {result.a.label}</div>
                <div className={`verdict ${d.change ? 'is-change' : ''}`}>{d.headline}</div>
                <div className="explain">{d.sentence}</div>
                <DifferencePlot r={result} metric={metric} />
              </div>
            );
          })()}

          <div className="card chart" style={{ marginTop: 12 }}>
            <h3 className="chart-title">Timeline <span className="muted">· do the groups take turns? A difference is fair only when they do.</span></h3>
            <Timeline r={result} format={m.fmt} tick={m.tick} minSpan={m.minSpan} invert={m.invert} onPick={(i) => { setFocus(i); setPanel(true); }} />
          </div>

          <div className="card chart" style={{ marginTop: 12 }}>
            <h3 className="chart-title">Inside the segment, minute by minute <span className="muted">· the mean of each group</span></h3>
            <ProfileChart lines={[{ id: 'a', label: result.a.label, values: meanProfile(result.a.points, metric) }, { id: 'b', label: result.b.label, values: meanProfile(result.b.points, metric) }]} format={m.fmt} tick={m.tick} minSpan={m.minSpan} invert={m.invert} colors={AB} ariaLabel="Per-minute profile of the two groups" />
          </div>

          {panel && (
            <>
              <div className="sheet-backdrop" onClick={() => setPanel(false)} style={{ background: 'transparent' }} />
              <InstancePanel included={included} rejected={result.rejected} group={byField(activeField!, va, vb)} groupLabel={{ A: va, B: vb }} value={(i) => { const v = valueOf(i, metric); return v === null ? '–' : m.fmt(v); }} focus={focus} onFocus={setFocus} onClose={() => setPanel(false)} />
            </>
          )}
        </>
      )}
    </>
  );
}

/** The two groups' colours: A the first series slot, B the second. */
const AB = ['var(--series-1)', 'var(--series-2)'];

/**
 * The difference B − A on its own axis, in the metric's unit: zero, the noise band around it,
 * the 95% interval as a whisker and the difference as a dot; the ends say which way is which.
 */
function DifferencePlot({ r, metric }: { r: AbResult; metric: BlockMetric }) {
  const [box, width] = useWidth();
  if (r.difference === null) return null;
  const noise = r.noise ?? 0;
  const reach = Math.max(Math.abs(r.ci?.[0] ?? 0), Math.abs(r.ci?.[1] ?? 0), noise, Math.abs(r.difference)) * 1.15 || 1;
  const ticks = niceTicks(-reach, reach, 6);
  const lo = Math.min(ticks[0], -reach);
  const hi = Math.max(ticks[ticks.length - 1], reach);
  const L = 16, R = 16, H = 96, mid = 40;
  const x = (v: number) => L + ((v - lo) / (hi - lo)) * (width - L - R);
  const unit = unitOf(metric);
  const pace = unit === 's/km';
  return (
    <div ref={box} style={{ marginTop: 10 }}>
      <svg width={width} height={H} role="img" aria-label="Difference and interval" style={{ display: 'block' }}>
        {noise > 0 && (
          <g>
            <rect x={x(-noise)} width={x(noise) - x(-noise)} y={mid - 18} height={36} fill="var(--surface-2)" />
            <text x={x(noise) + 6} y={mid - 8} fontSize="11" fill="var(--muted)">noise ±{Math.round(noise * 10) / 10} {unit}</text>
          </g>
        )}
        <line x1={L} x2={width - R} y1={H - 26} y2={H - 26} stroke="var(--axis)" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={H - 26} y2={H - 22} stroke="var(--axis)" />
            <text x={x(t)} y={H - 10} fontSize="11" textAnchor="middle" fill="var(--muted)" className="tnum">{t > 0 ? '+' : ''}{t.toFixed(tickDecimals(ticks))}</text>
          </g>
        ))}
        <line x1={x(0)} x2={x(0)} y1={mid - 24} y2={H - 26} stroke="var(--muted)" />
        {r.ci && (
          <g>
            <line x1={x(r.ci[0])} x2={x(r.ci[1])} y1={mid} y2={mid} stroke="var(--text)" strokeWidth="2" strokeLinecap="round" />
            <line x1={x(r.ci[0])} x2={x(r.ci[0])} y1={mid - 7} y2={mid + 7} stroke="var(--text)" strokeWidth="2" />
            <line x1={x(r.ci[1])} x2={x(r.ci[1])} y1={mid - 7} y2={mid + 7} stroke="var(--text)" strokeWidth="2" />
          </g>
        )}
        <circle cx={x(r.difference)} cy={mid} r="6" fill="var(--series-2)" stroke="var(--surface)" strokeWidth="2" />
      </svg>
      <div className="axis-ends small muted">
        <span>← {r.b.label} {pace ? 'faster' : 'lower'}</span>
        <span>{unit}, {r.b.label} − {r.a.label}{r.ci ? ' · whisker: 95% interval' : ''}</span>
        <span>{r.b.label} {pace ? 'slower' : 'higher'} →</span>
      </div>
    </div>
  );
}

function Timeline({ r, format, tick, minSpan, invert, onPick }: { r: AbResult; format: (v: number) => string; tick: (v: number, d?: number) => string; minSpan: number; invert?: boolean; onPick: (i: BlockInstance) => void }) {
  const [box, width] = useWidth();
  const pts = [...r.a.points.map((p) => ({ p, g: 0 })), ...r.b.points.map((p) => ({ p, g: 1 }))];
  if (!pts.length) return null;
  const val = (p: (typeof pts)[number]['p']) => (r.corrected ? p.corrected : p.raw);
  const ts = pts.map(({ p }) => Date.parse(p.instance.runStart));
  const vs = pts.map(({ p }) => val(p));
  const t0 = Math.min(...ts) - 4 * 86_400_000, t1 = Math.max(...ts) + 4 * 86_400_000;
  const span = Math.max(...vs) - Math.min(...vs) || Math.abs(vs[0]) * 0.05 || 1;
  const [lo0, hi0] = ensureSpan(Math.min(...vs) - span * 0.1, Math.max(...vs) + span * 0.1, minSpan);
  const ticks = niceTicks(lo0, hi0, 3).filter((t) => t >= lo0 && t <= hi0);
  const lo = Math.min(lo0, ...vs), hi = Math.max(hi0, ...vs);
  const H = 180, L = 52, R = 16, B = 26, T = 8;
  const x = (t: number) => L + ((t - t0) / (t1 - t0)) * (width - L - R);
  const y = (v: number) => { const f = (v - lo) / (hi - lo); return T + (invert ? f : 1 - f) * (H - T - B); };
  const labels = [r.a.label, r.b.label];
  return (
    <div ref={box}>
      <div className="chart-legend">{labels.map((l, g) => <Key key={l} kind="dot" color={AB[g]} label={l} />)}</div>
      <svg width={width} height={H} role="img" aria-label="Timeline of the two groups" style={{ display: 'block' }}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={width - R} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
            <text x={L - 8} y={y(v) + 4} fontSize="11" textAnchor="end" fill="var(--muted)" className="tnum">{tick(v, tickDecimals(ticks))}</text>
          </g>
        ))}
        <line x1={L} x2={width - R} y1={H - B} y2={H - B} stroke="var(--axis)" />
        {monthTicks(t0, t1).map((m) => <text key={m} x={x(m)} y={H - 8} fontSize="11" textAnchor="middle" fill="var(--muted)">{monthLabel(m)}</text>)}
        {pts.map(({ p, g }) => (
          <g key={p.instance.id} style={{ cursor: 'pointer' }} onClick={() => onPick(p.instance)}>
            <circle cx={x(Date.parse(p.instance.runStart))} cy={y(val(p))} r={12} fill="transparent" />
            <circle cx={x(Date.parse(p.instance.runStart))} cy={y(val(p))} r={4.5} fill={AB[g]} stroke="var(--surface)" strokeWidth="2" />
            <title>{`${labels[g]} · ${new Date(p.instance.runStart).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · ${format(val(p))}`}</title>
          </g>
        ))}
      </svg>
    </div>
  );
}
