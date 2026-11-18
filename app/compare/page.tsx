'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { InstancePanel } from '@/components/InstancePanel';
import { ProfileChart } from '@/components/TrendChart';
import { useOpenFolder } from '@/lib/client/folderContext';
import { readDefinitions } from '@/lib/blocks/definitions';
import type { BlockDefinition, BlockInstance, BlockInstancesFile, BlockMetric } from '@/lib/blocks/types';
import { MIN_AB_INSTANCES, abCsv, byField, computeAb, meanProfile, type AbResult } from '@/lib/compare/ab';
import { instancesCsv } from '@/lib/compare/csv';
import { CONTEXT_FIELDS, METRIC_LABEL, valueOf, type ContextField } from '@/lib/compare/select';
import { PATHS, readJson } from '@/lib/fs/folder';

const METRICS: { key: BlockMetric; short: string; fmt: (v: number) => string; unit: string; invert?: boolean }[] = [
  { key: 'groundContactTime', short: 'GCT', fmt: (v) => `${v.toFixed(1)} ms`, unit: 'ms' },
  { key: 'heartRate', short: 'HR', fmt: (v) => `${v.toFixed(1)} bpm`, unit: 'bpm' },
  { key: 'speed', short: 'Pace', fmt: (v) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`, unit: 's/km', invert: true },
  { key: 'cadence', short: 'Cadence', fmt: (v) => `${v.toFixed(1)} spm`, unit: 'spm' },
  { key: 'verticalOscillation', short: 'VO', fmt: (v) => `${v.toFixed(1)} mm`, unit: 'mm' },
  { key: 'stepLength', short: 'Step', fmt: (v) => `${v.toFixed(0)} mm`, unit: 'mm' },
  { key: 'power', short: 'Power', fmt: (v) => `${v.toFixed(0)} W`, unit: 'W' },
  { key: 'legSpringStiffness', short: 'LSS', fmt: (v) => `${v.toFixed(2)} kN/m`, unit: 'kN/m' },
];

export default function ComparePageWrapper() {
  return <Suspense><ComparePage /></Suspense>;
}

/** A/B comparison: two sets of instances of one definition that differ in one context field. */
function ComparePage() {
  const params = useSearchParams();
  const router = useRouter();
  const { folder } = useOpenFolder();
  const [defs, setDefs] = useState<BlockDefinition[]>([]);
  const [all, setAll] = useState<BlockInstance[]>([]);
  const [metric, setMetric] = useState<BlockMetric>('groundContactTime');
  const [corrected, setCorrected] = useState(true);
  const [field, setField] = useState<ContextField>('shoes');
  const [pair, setPair] = useState<[string, string] | null>(null);
  const [panel, setPanel] = useState(false);
  const [focus, setFocus] = useState<BlockInstance | null>(null);

  useEffect(() => {
    (async () => {
      setDefs((await readDefinitions(folder)).filter((d) => d.status === 'active'));
      setAll((await readJson<BlockInstancesFile>(folder, PATHS.blockInstances))?.instances ?? []);
    })();
  }, [folder]);

  const defId = params.get('def') ?? defs[0]?.id ?? '';
  const def = defs.find((d) => d.id === defId);
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

  if (!defs.length) return <div className="page"><div className="page-head"><h1>A/B comparison</h1></div><div className="card empty">No block definitions yet. Accept a suggestion on the Blocks screen first.</div></div>;

  const included = result ? [...result.a.points, ...result.b.points].map((p) => p.instance) : [];
  const base = (def?.name ?? 'block').replace(/[^\w-]+/g, '_');

  return (
    <div className="page">
      <div className="page-head">
        <h1>A/B comparison</h1>
        <select className="select" value={defId} onChange={(e) => router.replace(`/compare?def=${e.target.value}`)}>
          {defs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <span className="spacer" />
        {result && <button className="btn" onClick={() => { download(`${base}-ab.csv`, abCsv(result, def?.name ?? '')); download(`${base}-ab-instances.csv`, instancesCsv(included)); }}>Export CSV</button>}
        {result && <button className="btn primary" onClick={() => setPanel(true)}>Instances {included.length} · rejected {result.rejected.length}</button>}
      </div>

      <div className="toolbar">
        <div className="segmented">{METRICS.map((x) => <button key={x.key} className={metric === x.key ? 'on' : ''} onClick={() => setMetric(x.key)}>{x.short}</button>)}</div>
        <div className="segmented">
          <button className={!corrected ? 'on' : ''} onClick={() => setCorrected(false)}>Raw</button>
          <button className={corrected ? 'on' : ''} onClick={() => setCorrected(true)}>Corrected</button>
        </div>
        {fields.length > 0 && (
          <>
            <span className="muted small">Split by</span>
            <select className="select small" value={activeField} onChange={(e) => { setField(e.target.value as ContextField); setPair(null); }}>
              {fields.map((f) => <option key={f} value={f}>{CONTEXT_FIELDS[f].label}</option>)}
            </select>
            <select className="select small" value={va} onChange={(e) => setPair([e.target.value, vb])}>{values[activeField].map((v) => <option key={v}>{v}</option>)}</select>
            <span className="muted small">vs</span>
            <select className="select small" value={vb} onChange={(e) => setPair([va, e.target.value])}>{values[activeField].map((v) => <option key={v}>{v}</option>)}</select>
          </>
        )}
      </div>

      {!result ? (
        <div className="card empty">
          No context field splits this block&apos;s instances yet. Register two pairs of shoes (or tag runs) on the Gear and tags screen; each instance carries the shoes of its run.
        </div>
      ) : (
        <>
          {result.warnings.map((w) => <div key={w} className="banner warn">⚠ {w}</div>)}
          <div className="card" style={{ padding: 16, display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 2fr', gap: 16, alignItems: 'center' }}>
            <div>
              <div className="muted small">{METRIC_LABEL[metric]} · {result.b.label} − {result.a.label}{corrected ? ' · corrected for pace' : ''}</div>
              <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em' }}>
                {result.difference === null ? '–' : `${result.difference > 0 ? '+' : ''}${result.difference.toFixed(1)} ${m.unit}`}
              </div>
              {result.ci && <div className="small muted">95% interval {result.ci[0].toFixed(1)} … {result.ci[1].toFixed(1)} · noise ±{result.noise!.toFixed(1)}</div>}
              <div className="small muted">{result.a.label}: {result.a.points.length} · {result.b.label}: {result.b.points.length}</div>
              {result.verdict ? (
                <span className={`pill ${result.verdict === 'change' ? 'on' : ''}`} style={{ fontSize: 14 }}>{result.verdict === 'change' ? 'Change' : 'No detectable change'}</span>
              ) : (
                <span className="pill">No verdict: needs {MIN_AB_INSTANCES} on each side</span>
              )}
            </div>
            <ForestPlot r={result} />
          </div>

          <div className="card" style={{ padding: 12, marginTop: 12 }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 13 }}>Timeline <span className="muted" style={{ fontWeight: 400 }}>· do the groups interleave?</span></h3>
            <Timeline r={result} format={m.fmt} invert={m.invert} onPick={(i) => { setFocus(i); setPanel(true); }} />
          </div>

          <div className="card" style={{ padding: 12, marginTop: 12 }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 13 }}>Per-minute profile inside the block <span className="muted" style={{ fontWeight: 400 }}>· group means</span></h3>
            <ProfileChart lines={[{ id: 'a', label: result.a.label, values: meanProfile(result.a.points, metric) }, { id: 'b', label: result.b.label, values: meanProfile(result.b.points, metric) }]} format={m.fmt} invert={m.invert} />
          </div>

          {panel && (
            <>
              <div className="sheet-backdrop" onClick={() => setPanel(false)} style={{ background: 'transparent' }} />
              <InstancePanel included={included} rejected={result.rejected} value={(i) => { const v = valueOf(i, metric); return v === null ? '–' : m.fmt(v); }} focus={focus} onFocus={setFocus} onClose={() => setPanel(false)} />
            </>
          )}
        </>
      )}
    </div>
  );
}

/** The difference with its interval against zero and the noise band. */
function ForestPlot({ r }: { r: AbResult }) {
  if (r.difference === null || !r.ci) return null;
  const span = Math.max(Math.abs(r.ci[0]), Math.abs(r.ci[1]), r.noise ?? 0, Math.abs(r.difference)) * 1.3 || 1;
  const W = 600;
  const x = (v: number) => W / 2 + (v / span) * (W / 2 - 20);
  return (
    <svg viewBox={`0 0 ${W} 90`} width="100%" role="img" aria-label="Difference and interval">
      <rect x={x(-(r.noise ?? 0))} width={x(r.noise ?? 0) - x(-(r.noise ?? 0))} y={20} height={40} fill="var(--accent-soft)" />
      <text x={x(r.noise ?? 0) + 4} y={30} fontSize="11" fill="var(--muted)">noise</text>
      <line x1={x(0)} x2={x(0)} y1={12} y2={68} stroke="var(--muted)" strokeDasharray="3 3" />
      <text x={x(0)} y={84} fontSize="11" textAnchor="middle" fill="var(--muted)">0</text>
      <line x1={x(r.ci[0])} x2={x(r.ci[1])} y1={40} y2={40} stroke="var(--text)" strokeWidth="3" />
      <line x1={x(r.ci[0])} x2={x(r.ci[0])} y1={32} y2={48} stroke="var(--text)" strokeWidth="2" />
      <line x1={x(r.ci[1])} x2={x(r.ci[1])} y1={32} y2={48} stroke="var(--text)" strokeWidth="2" />
      <circle cx={x(r.difference)} cy={40} r="7" fill="var(--accent)" />
    </svg>
  );
}

function Timeline({ r, format, invert, onPick }: { r: AbResult; format: (v: number) => string; invert?: boolean; onPick: (i: BlockInstance) => void }) {
  const pts = [...r.a.points.map((p) => ({ p, g: 'a' as const })), ...r.b.points.map((p) => ({ p, g: 'b' as const }))];
  if (!pts.length) return null;
  const val = (p: (typeof pts)[number]['p']) => (r.corrected ? p.corrected : p.raw);
  const ts = pts.map(({ p }) => Date.parse(p.instance.runStart));
  const vs = pts.map(({ p }) => val(p));
  const t0 = Math.min(...ts) - 4e8, t1 = Math.max(...ts) + 4e8;
  const pad = (Math.max(...vs) - Math.min(...vs)) * 0.15 || 1;
  const lo = Math.min(...vs) - pad, hi = Math.max(...vs) + pad;
  const W = 900, H = 160;
  const x = (t: number) => 50 + ((t - t0) / (t1 - t0)) * (W - 62);
  const y = (v: number) => { const f = (v - lo) / (hi - lo); return 10 + (invert ? f : 1 - f) * (H - 30); };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Timeline of the two groups">
      <text x={44} y={y(hi - pad) + 4} fontSize="11" textAnchor="end" fill="var(--muted)">{format(hi - pad)}</text>
      <text x={44} y={y(lo + pad) + 4} fontSize="11" textAnchor="end" fill="var(--muted)">{format(lo + pad)}</text>
      {pts.map(({ p, g }) => (
        <circle key={p.instance.id} cx={x(Date.parse(p.instance.runStart))} cy={y(val(p))} r={5} fill={g === 'a' ? 'var(--series-1)' : 'var(--series-3)'} style={{ cursor: 'pointer' }} onClick={() => onPick(p.instance)}>
          <title>{`${g === 'a' ? r.a.label : r.b.label} · ${p.instance.runStart.slice(0, 10)} · ${format(val(p))}`}</title>
        </circle>
      ))}
      <text x={W - 10} y={H - 4} fontSize="11" textAnchor="end" fill="var(--series-1)">● {r.a.label}</text>
      <text x={W - 10} y={H - 18} fontSize="11" textAnchor="end" fill="var(--series-3)">● {r.b.label}</text>
    </svg>
  );
}
