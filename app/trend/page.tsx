'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { InstancePanel } from '@/components/InstancePanel';
import { ProfileChart, TrendChart, type Marker } from '@/components/TrendChart';
import { useOpenFolder } from '@/lib/client/folderContext';
import { readDefinitions } from '@/lib/blocks/definitions';
import type { BlockDefinition, BlockInstance, BlockInstancesFile, BlockMetric } from '@/lib/blocks/types';
import { readGear, type Gear } from '@/lib/context/gear';
import { instancesCsv } from '@/lib/compare/csv';
import { CONTEXT_FIELDS, METRIC_LABEL, valueOf, type ContextField, type ContextFilter } from '@/lib/compare/select';
import { MIN_TREND_INSTANCES, computeTrend, profiles } from '@/lib/compare/trend';
import { PATHS, readJson } from '@/lib/fs/folder';

const METRICS: { key: BlockMetric; short: string; fmt: (v: number) => string; invert?: boolean }[] = [
  { key: 'heartRate', short: 'HR', fmt: (v) => `${v.toFixed(0)} bpm` },
  { key: 'speed', short: 'Pace', fmt: (v) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`, invert: true },
  { key: 'cadence', short: 'Cadence', fmt: (v) => `${v.toFixed(0)} spm` },
  { key: 'groundContactTime', short: 'GCT', fmt: (v) => `${v.toFixed(0)} ms` },
  { key: 'verticalOscillation', short: 'VO', fmt: (v) => `${v.toFixed(0)} mm` },
  { key: 'stepLength', short: 'Step', fmt: (v) => `${v.toFixed(0)} mm` },
  { key: 'power', short: 'Power', fmt: (v) => `${v.toFixed(0)} W` },
  { key: 'legSpringStiffness', short: 'LSS', fmt: (v) => `${v.toFixed(1)} kN/m` },
];

export default function TrendPageWrapper() {
  return <Suspense><TrendPage /></Suspense>;
}

/** Trend: the instances of one definition over time, the noise threshold, gear changes; the instances behind it. */
function TrendPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { folder } = useOpenFolder();
  const [defs, setDefs] = useState<BlockDefinition[]>([]);
  const [all, setAll] = useState<BlockInstance[]>([]);
  const [gear, setGear] = useState<Gear[]>([]);
  const [metric, setMetric] = useState<BlockMetric>('heartRate');
  const [corrected, setCorrected] = useState(true);
  const [filter, setFilter] = useState<ContextFilter>({});
  const [selected, setSelected] = useState<BlockInstance[]>([]);
  const [panel, setPanel] = useState(false);
  const [focus, setFocus] = useState<BlockInstance | null>(null);

  useEffect(() => {
    (async () => {
      setDefs((await readDefinitions(folder)).filter((d) => d.status === 'active'));
      setAll((await readJson<BlockInstancesFile>(folder, PATHS.blockInstances))?.instances ?? []);
      setGear(await readGear(folder));
    })();
  }, [folder]);

  const defId = params.get('def') ?? defs[0]?.id ?? '';
  const def = defs.find((d) => d.id === defId);
  const m = METRICS.find((x) => x.key === metric)!;
  const trend = useMemo(() => computeTrend(all, defId, metric, filter, corrected), [all, defId, metric, filter, corrected]);
  const mine = useMemo(() => all.filter((i) => i.definitionId === defId), [all, defId]);

  const options = useMemo(() => {
    const o = {} as Record<ContextField, string[]>;
    for (const f of Object.keys(CONTEXT_FIELDS) as ContextField[]) o[f] = [...new Set(mine.map((i) => CONTEXT_FIELDS[f].get(i)).filter((v): v is string => !!v))].sort();
    return o;
  }, [mine]);

  const markers: Marker[] = useMemo(() => {
    const out: Marker[] = gear.map((g) => ({ date: `${g.from}T00:00:00`, label: `${g.type === 'shoes' ? '👟' : '♥'} ${g.name}` }));
    const byDevice = [...mine].sort((a, b) => a.runStart.localeCompare(b.runStart));
    for (let k = 1; k < byDevice.length; k++) if (byDevice[k].context.run.device !== byDevice[k - 1].context.run.device) out.push({ date: byDevice[k].runStart, label: `⌚ ${byDevice[k].context.run.device.replace('COROS ', '')}` });
    return out;
  }, [gear, mine]);

  const toggle = (i: BlockInstance) => {
    setFocus(i);
    setSelected((s) => (s.some((x) => x.id === i.id) ? s.filter((x) => x.id !== i.id) : [...s, i].slice(-4)));
  };

  const exportCsv = () => {
    const names = new Map(defs.map((d) => [d.id, d.name]));
    const blob = new Blob([instancesCsv(mine, names)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(def?.name ?? 'block').replace(/[^\w-]+/g, '_')}-instances.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!defs.length) return <div className="page"><div className="page-head"><h1>Trend</h1></div><div className="card empty">No block definitions yet. Accept a suggestion on the Blocks screen first.</div></div>;

  const fmtVal = (i: BlockInstance) => { const v = valueOf(i, metric); return v === null ? '–' : m.fmt(v); };
  const included = trend.series.flatMap((s) => s.points.map((p) => p.instance));

  return (
    <div className="page">
      <div className="page-head">
        <h1>Trend</h1>
        <select value={defId} onChange={(e) => { setSelected([]); router.replace(`/trend?def=${e.target.value}`); }} className="select">
          {defs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <span className="spacer" />
        <button className="btn" onClick={exportCsv}>Export CSV</button>
        <button className="btn primary" onClick={() => setPanel(true)}>Instances {trend.included} · rejected {trend.rejected.length}</button>
      </div>

      <div className="toolbar">
        <div className="segmented">
          {METRICS.map((x) => <button key={x.key} className={metric === x.key ? 'on' : ''} onClick={() => setMetric(x.key)}>{x.short}</button>)}
        </div>
        <div className="segmented" title="Corrected: residual pace difference removed by regression">
          <button className={!corrected ? 'on' : ''} onClick={() => setCorrected(false)}>Raw</button>
          <button className={corrected ? 'on' : ''} onClick={() => setCorrected(true)}>Corrected</button>
        </div>
        {(Object.keys(CONTEXT_FIELDS) as ContextField[]).filter((f) => options[f].length > 1).map((f) => (
          <select key={f} className="select small" value={filter[f] ?? ''} onChange={(e) => setFilter({ ...filter, [f]: e.target.value || undefined })}>
            <option value="">{CONTEXT_FIELDS[f].label}: any</option>
            {options[f].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        ))}
      </div>

      <TrendChart trend={trend} format={m.fmt} invert={m.invert} markers={markers} selected={new Set(selected.map((s) => s.id))} onSelect={toggle} />

      <div className="cards" style={{ marginTop: 12 }}>
        {trend.series.map((s) => (
          <div key={s.source} className="card" style={{ padding: 12 }}>
            <div className="muted small">{METRIC_LABEL[metric]} · {s.source} · {s.points.length} instances</div>
            {s.fit ? (
              <>
                <div style={{ fontSize: 20, fontWeight: 650, margin: '4px 0' }}>{s.fit.change > 0 ? '+' : ''}{s.fit.change.toFixed(1)}</div>
                <div className="small muted">95% interval {s.fit.ci[0].toFixed(1)} … {s.fit.ci[1].toFixed(1)} · noise ±{s.noise.toFixed(1)}</div>
                <span className={`pill ${s.fit.verdict === 'change' ? 'on' : ''}`}>{s.fit.verdict === 'change' ? 'Change' : 'No detectable change'}</span>
              </>
            ) : (
              <div className="small muted" style={{ marginTop: 6 }}>Points only: a verdict needs at least {MIN_TREND_INSTANCES} instances.</div>
            )}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 12, padding: 12 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 13 }}>Profile inside the block <span className="muted" style={{ fontWeight: 400 }}>· click up to 4 points</span></h3>
        <ProfileChart
          lines={profiles(selected, metric).map((p) => ({ id: p.instance.id, label: new Date(p.instance.runStart).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), values: p.values }))}
          format={m.fmt}
          invert={m.invert}
        />
      </div>

      {panel && (
        <>
          <div className="sheet-backdrop" onClick={() => setPanel(false)} style={{ background: 'transparent' }} />
          <InstancePanel included={included} rejected={trend.rejected} value={fmtVal} focus={focus} onFocus={setFocus} onClose={() => setPanel(false)} />
        </>
      )}
    </div>
  );
}
