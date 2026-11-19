'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { LineChart, RouteMap } from '@/components/charts';
import { useOpenFolder } from '@/lib/client/folderContext';
import { PATHS, readJson } from '@/lib/fs/folder';
import type { RunFile } from '@/lib/ingest/importFolder';
import { definitionFromSelection, readDefinitions, selectionOptions, writeDefinitions } from '@/lib/blocks/definitions';
import { runInWorker } from '@/lib/client/worker';
import { useRouter } from 'next/navigation';
import type { BlockInstance, BlockType } from '@/lib/blocks/types';
import { date, duration, km, pace, time } from '@/lib/format';

export default function RunPageWrapper() {
  return (
    <Suspense>
      <RunPage />
    </Suspense>
  );
}

/** Run: metrics over time on 10 s windows, the route, laps and quality-flagged windows. */
function RunPage() {
  const id = useSearchParams().get('id') ?? '';
  const { folder, handle } = useOpenFolder();
  const router = useRouter();
  const [selection, setSelection] = useState<{ from: number; to: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [run, setRun] = useState<RunFile | null | undefined>(undefined);
  const [cursor, setCursor] = useState<number | null>(null);
  const [blocks, setBlocks] = useState<(BlockInstance & { name: string })[]>([]);

  useEffect(() => {
    readJson<RunFile>(folder, PATHS.runFile(id)).then(setRun).catch(() => setRun(null));
    (async () => {
      const names = new Map((await readDefinitions(folder)).map((d) => [d.id, d.name]));
      const all = (await readJson<{ instances: BlockInstance[] }>(folder, PATHS.blockInstances))?.instances ?? [];
      setBlocks(all.filter((i) => i.runId === id).map((i) => ({ ...i, name: names.get(i.definitionId) ?? i.definitionId })).sort((a, b) => a.start - b.start));
    })();
  }, [folder, id]);

  const view = useMemo(() => {
    if (!run) return null;
    const w = run.windows;
    const WINDOW_SECONDS = w.start.length > 1 ? w.start[1] - w.start[0] : 10;
    const x = w.start.map((s) => s + WINDOW_SECONDS / 2);
    const flagged: { from: number; to: number }[] = [];
    w.start.forEach((s, i) => {
      if (w.flags.stopped[i] || w.flags.grade[i] || w.flags.missingSignal[i]) flagged.push({ from: s, to: s + WINDOW_SECONDS });
    });
    const laps = run.laps.map((l) => ({ from: l.start, to: l.end }));
    const count = (k: 'stopped' | 'grade' | 'first150') => w.flags[k].filter(Boolean).length;
    return { w, x, flagged, laps, flags: { stopped: count('stopped'), grade: count('grade'), first150: count('first150'), missing: w.flags.missingSignal.filter(Boolean).length } };
  }, [run]);

  const create = async (type: BlockType) => {
    if (!run || !selection) return;
    setCreating(true);
    const def = definitionFromSelection(run, selection.from, selection.to, type);
    await writeDefinitions(folder, [...(await readDefinitions(folder)), def]);
    await runInWorker('blocks', handle);
    router.push('/blocks');
  };

  if (run === undefined) return <div className="page muted">Loading…</div>;
  if (!run || !view) return <div className="page">Run not found. <Link href="/" className="muted">← Runs</Link></div>;
  const { w, x, flagged, laps } = view;
  const common = { x, laps, flagged, selection, onSelect: setSelection, blocks: blocks.map((b) => ({ from: b.start, to: b.end, ok: b.status === 'accepted' })), cursor, onCursor: setCursor };

  return (
    <div className="page">
      <div className="page-head">
        <Link href="/" className="muted">← Runs</Link>
        <h1>{date(run.startTime)} · {time(run.startTime)}</h1>
        <span className="spacer" />
        <span className="chip">{run.device}</span>
        <span className="chip">{run.laps.length} laps</span>
        {run.temperature !== null && <span className="chip">{run.temperature} °C</span>}
      </div>
      <div className="stats">
        <div className="card stat"><div className="v">{km(run.distance)} km</div><div className="l">distance</div></div>
        <div className="card stat"><div className="v">{duration(run.duration)}</div><div className="l">moving time</div></div>
        <div className="card stat"><div className="v">{pace(run.distance / run.duration)} /km</div><div className="l">average pace</div></div>
        <div className="card stat"><div className="v">{view.flags.stopped + view.flags.grade + view.flags.missing}</div><div className="l">flagged 10 s windows (stopped {view.flags.stopped} · grade {view.flags.grade} · missing {view.flags.missing})</div></div>
      </div>
      <div className="legend">
        <span><i style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }} />lap</span>
        <span><i style={{ background: 'repeating-linear-gradient(45deg, var(--muted) 0 2px, transparent 2px 5px)', opacity: 0.5 }} />flagged window (stopped, grade, missing signal)</span>
        <span><i style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }} />block instance</span>
        <span className="muted">Drag across a chart, or click two points on the route, to select a fragment.</span>
      </div>
      <div className="run-grid">
        <div>
          <RouteMap lat={run.samples.lat} lon={run.samples.lon} t={run.samples.t} cursor={cursor} selection={selection} onSelect={setSelection} />
          <div className="card" style={{ marginTop: 12, padding: 12 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>Detected blocks</h3>
            {blocks.length === 0 && <div className="muted small">None. Accept block suggestions on the Blocks screen.</div>}
            {blocks.map((b) => (
              <div key={b.id} className="small" style={{ padding: '6px 0', borderTop: '1px solid var(--border)' }} onMouseEnter={() => setCursor(b.start)}>
                <span className="dot" style={{ background: b.status === 'accepted' ? 'var(--ok)' : 'var(--muted)', marginRight: 6 }} />
                <b>{b.name}</b> <span className="muted">min {Math.floor(b.start / 60)}–{Math.ceil(b.end / 60)} · {pace(b.metrics.speed)} /km{b.metrics.heartRate ? ` · ${Math.round(b.metrics.heartRate)} bpm` : ''}</span>
                {b.reasons.length > 0 && <div className="muted" style={{ marginLeft: 14 }}>✗ {b.reasons.join(' · ')}</div>}
                {b.status === 'accepted' && !b.heartRate.valid && <div className="muted" style={{ marginLeft: 14 }}>♥ not used: {b.heartRate.reason}</div>}
              </div>
            ))}
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <table className="data">
              <thead><tr><th>Lap</th><th>km</th><th>Time</th><th>Pace</th></tr></thead>
              <tbody>
                {run.laps.map((l, i) => (
                  <tr key={i}><td>{i + 1}</td><td>{km(l.distance)}</td><td>{duration(l.duration)}</td><td>{pace(l.duration ? l.distance / l.duration : 0)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <LineChart title="Pace /km" y={w.speed} format={(v) => pace(v)} invert {...common} />
          <LineChart title="Effort pace /km (grade-adjusted)" y={w.effortPace} format={(v) => pace(v)} invert color="var(--series-2)" {...common} />
          <LineChart title="Heart rate bpm" y={w.heartRate} format={(v) => `${Math.round(v)} bpm`} color="var(--err)" {...common} />
          <LineChart title="Cadence spm" y={w.cadence} format={(v) => `${Math.round(v)} spm`} color="var(--series-3)" {...common} />
          <LineChart title="Ground contact time ms" y={w.groundContactTime} format={(v) => `${Math.round(v)} ms`} color="var(--series-4)" {...common} />
          <LineChart title="Vertical oscillation mm" y={w.verticalOscillation} format={(v) => `${Math.round(v)} mm`} color="var(--series-2)" {...common} />
          <LineChart title="Power W" y={w.power} format={(v) => `${Math.round(v)} W`} color="var(--series-1)" {...common} />
        </div>
      </div>
      {selection && (
        <div className="float-bar">
          <span>Selected min {(selection.from / 60).toFixed(1)}–{(selection.to / 60).toFixed(1)} · {Math.round(selection.to - selection.from)} s</span>
          <span className="muted">Create block definition as</span>
          {selectionOptions(run, selection.from, selection.to).map((t) => (
            <button key={t} className="btn primary" disabled={creating} onClick={() => create(t)}>{t === 'route' ? 'Route segment' : t === 'structure' ? 'Workout structure (lap)' : 'Steady fragment'}</button>
          ))}
          <button className="btn" onClick={() => setSelection(null)}>✕</button>
        </div>
      )}
    </div>
  );
}
