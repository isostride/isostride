'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOpenFolder, runInWorker } from '@/lib/client';
import { RECOMMENDATIONS_PATH, fromRecommendation, readDefinitions, writeDefinitions, type BlockDefinition, type BlockInstancesFile, type BlockParams, type Recommendation, type RefPoint, type Tolerances } from '@/lib/blocks';
import { PATHS, readJson } from '@/lib/fs';
import { date } from '@/lib/format';

const fmtPace = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** Blocks: the system's recommendations and the runner's block definitions with their instance counts and tolerances. */
export default function BlocksPage() {
  const { folder, handle } = useOpenFolder();
  const [defs, setDefs] = useState<BlockDefinition[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [inst, setInst] = useState<BlockInstancesFile['instances']>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<BlockDefinition | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setDefs(await readDefinitions(folder));
    setRecs((await readJson<{ recommendations: Recommendation[] }>(folder, RECOMMENDATIONS_PATH))?.recommendations ?? []);
    setInst((await readJson<BlockInstancesFile>(folder, PATHS.blockInstances))?.instances ?? []);
  }, [folder]);
  useEffect(() => { load(); }, [load]);

  const save = async (next: BlockDefinition[], what: string) => {
    setBusy(what);
    await writeDefinitions(folder, next);
    await runInWorker('blocks', handle);
    await load();
    setBusy(null);
  };

  const stats = useMemo(() => {
    const m = new Map<string, { accepted: number; rejected: number; last: string | null }>();
    for (const i of inst) {
      const s = m.get(i.definitionId) ?? { accepted: 0, rejected: 0, last: null };
      if (i.status === 'accepted') s.accepted++;
      else s.rejected++;
      if (!s.last || i.runStart > s.last) s.last = i.runStart;
      m.set(i.definitionId, s);
    }
    return m;
  }, [inst]);

  const active = defs.filter((d) => d.status === 'active');
  const shown = showAll ? recs : recs.slice(0, 6);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Blocks</h1>
        <span className="spacer" />
        {busy && <span className="chip">⟳ {busy}…</span>}
      </div>

      <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>Suggested <span className="muted" style={{ fontWeight: 400 }}>· found in your runs</span></h3>
      {recs.length === 0 ? (
        <div className="card empty" style={{ marginBottom: 20 }}>No suggestions. Import more runs: a route passed 5 times or a lap set up in 3 workouts is proposed here.</div>
      ) : (
        <div className="cards" style={{ marginBottom: 8 }}>
          {shown.map((r) => (
            <div key={r.id} className="card block-card suggested">
              <Thumb params={r.params} />
              <div className="title">{r.name}</div>
              <div className="muted small">{r.basis}</div>
              {r.tolerances.paceMin !== null && <div className="muted small">pace band {fmtPace(r.tolerances.paceMin)}–{fmtPace(r.tolerances.paceMax!)} /km</div>}
              <div className="actions">
                <button className="btn primary" disabled={!!busy} onClick={() => save([...defs, fromRecommendation(r, 'active')], `Adding ${r.name}`)}>Accept</button>
                <button className="btn" disabled={!!busy} onClick={() => save([...defs, fromRecommendation(r, 'rejected')], `Dismissing ${r.name}`)}>Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {recs.length > 6 && <button className="btn" style={{ marginBottom: 20 }} onClick={() => setShowAll((s) => !s)}>{showAll ? 'Show fewer' : `Show all ${recs.length}`}</button>}

      <h3 style={{ margin: '12px 0 10px', fontSize: 14 }}>My blocks</h3>
      {active.length === 0 ? (
        <div className="card empty">No blocks yet. Accept a suggestion above.</div>
      ) : (
        <div className="cards">
          {active.map((d) => {
            const s = stats.get(d.id);
            return (
              <div key={d.id} className="card block-card" onClick={() => setEditing(d)} style={{ cursor: 'pointer' }}>
                <Thumb params={d.params} />
                <div className="title">{d.name}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span className="chip">{d.params.type === 'route' ? 'route segment' : d.params.type === 'structure' ? 'workout structure' : 'steady fragment'}</span>
                  <span className="chip">{d.origin}</span>
                </div>
                <div className="small"><b>{s?.accepted ?? 0}</b> accepted · <span className="muted">{s?.rejected ?? 0} rejected{s?.last ? ` · last ${date(s.last)}` : ''}</span></div>
                <div className="actions small">
                  <Link href={`/trend?def=${d.id}`} onClick={(e) => e.stopPropagation()} className="muted">Trend →</Link>
                  <Link href={`/compare?def=${d.id}`} onClick={(e) => e.stopPropagation()} className="muted">Compare A/B →</Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <ToleranceSheet
          def={editing}
          onClose={() => setEditing(null)}
          onSave={(d) => { setEditing(null); save(defs.map((x) => (x.id === d.id ? d : x)), `Re-detecting ${d.name}`); }}
        />
      )}
    </div>
  );
}

/** A tiny picture of a definition: the route's shape, or the lap. */
function Thumb({ params }: { params: BlockParams }) {
  if (params.type === 'route') return <RouteThumb track={params.track} />;
  const label = params.type === 'structure' ? (params.kind === 'time' ? `⏱ ${params.target / 60} min` : `↔ ${params.target / 1000} km`) : '≈ steady';
  return <div className="thumb">{label}</div>;
}

function RouteThumb({ track }: { track: RefPoint[] }) {
  const lats = track.map((p) => p.lat);
  const lons = track.map((p) => p.lon);
  const kx = Math.cos((lats[0] * Math.PI) / 180);
  const minX = Math.min(...lons) * kx, maxX = Math.max(...lons) * kx, minY = Math.min(...lats), maxY = Math.max(...lats);
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const d = track.map((p, i) => `${i ? 'L' : 'M'}${(8 + ((p.lon * kx - minX) / span) * 84).toFixed(1)},${(52 - ((p.lat - minY) / span) * 44).toFixed(1)}`).join('');
  const end = track[track.length - 1];
  return (
    <svg className="thumb" viewBox="0 0 100 60" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={8 + ((end.lon * kx - minX) / span) * 84} cy={52 - ((end.lat - minY) / span) * 44} r="3" fill="var(--accent)" />
    </svg>
  );
}

const FIELDS: { key: keyof Tolerances; label: string; unit: string; scale?: number; pace?: boolean }[] = [
  { key: 'paceMin', label: 'Pace band from', unit: '/km', pace: true },
  { key: 'paceMax', label: 'Pace band to', unit: '/km', pace: true },
  { key: 'gradeMax', label: 'Grade: effort pace vs pace, max', unit: '%', scale: 100 },
  { key: 'cvMax', label: 'Pace steadiness: CV below', unit: '' },
  { key: 'effortBeforeMax', label: 'Effort in the 2 min before, max difference', unit: '%', scale: 100 },
  { key: 'stoppedMax', label: 'Stopped inside the block, max', unit: 's' },
  { key: 'hrStartMin', label: 'Heart rate: block starts after', unit: 'min', scale: 1 / 60 },
  { key: 'routeShare', label: 'Route: points matched, min', unit: '%', scale: 100 },
  { key: 'routeRadius', label: 'Route: within', unit: 'm' },
];

function ToleranceSheet({ def, onClose, onSave }: { def: BlockDefinition; onClose: () => void; onSave: (d: BlockDefinition) => void }) {
  const [name, setName] = useState(def.name);
  const [tol, setTol] = useState<Tolerances>(def.tolerances);
  const show = (f: (typeof FIELDS)[number]) => {
    const v = tol[f.key];
    if (v === null) return '';
    return f.pace ? fmtPace(v) : String(Math.round(v * (f.scale ?? 1) * 100) / 100);
  };
  const parse = (f: (typeof FIELDS)[number], text: string): number | null => {
    if (!text.trim()) return null;
    if (f.pace) {
      const [m, s] = text.split(':').map(Number);
      return Number.isFinite(m) ? m * 60 + (s || 0) : null;
    }
    const n = Number(text);
    return Number.isFinite(n) ? n / (f.scale ?? 1) : null;
  };
  const fields = FIELDS.filter((f) => def.params.type === 'route' || !f.key.startsWith('route'));
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <aside className="sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Block definition</h3>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <p className="muted small">Matching tolerances. Defaults come from the preliminary analysis of 18 Nov 2026; empty means not checked.</p>
        {fields.map((f) => (
          <label key={f.key} className="field">
            <span>{f.label}</span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input defaultValue={show(f)} placeholder="–" onBlur={(e) => setTol({ ...tol, [f.key]: parse(f, e.target.value) } as Tolerances)} style={{ width: 80 }} />
              <span className="muted small" style={{ width: 28 }}>{f.unit}</span>
            </span>
          </label>
        ))}
        <button className="btn primary" style={{ width: '100%', marginTop: 12 }} onClick={() => onSave({ ...def, name, tolerances: tol })}>Save &amp; re-detect</button>
      </aside>
    </div>
  );
}
