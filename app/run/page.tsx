'use client';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { LANE, LineChart, RouteMap, clock, useWidth } from '@/components';
import { useOpenFolder, runInWorker } from '@/lib/client';
import { PATHS, readJson } from '@/lib/fs';
import type { RunFile } from '@/lib/kernel';
import { canDefineFromLaps, definitionFromLaps, efficiencyOf, definitionFromSelection, readDefinitions, selectionOptions, writeDefinitions, type BlockDefinition, type BlockInstance, type BlockType } from '@/lib/blocks';
import { date, duration, km, pace, time } from '@/lib/format';

type WindowKey = 'speed' | 'efficiency' | 'effortPace' | 'heartRate' | 'cadence' | 'groundContactTime' | 'verticalOscillation' | 'stepLength' | 'power' | 'altitude' | 'legSpringStiffness';
const round0 = (unit: string) => (v: number) => `${Math.round(v)} ${unit}`;
/** The metrics a run can show, in the order of the stack; the first four show by default. */
const int = (v: number, d = 0) => v.toFixed(d);
/** Pace in s/km as m:ss. */
const mmss = (v: number) => { const r = Math.round(v); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; };
const METRICS: { key: WindowKey; title: string; unit: string; format: (v: number) => string; tick: (v: number, d?: number) => string; minSpan: number; invert?: boolean }[] = [
  { key: 'speed', title: 'Pace', unit: 'min/km', format: (v) => `${mmss(v)} /km`, tick: mmss, minSpan: 20, invert: true },
  { key: 'heartRate', title: 'Heart rate', unit: 'bpm', format: round0('bpm'), tick: int, minSpan: 10 },
  { key: 'cadence', title: 'Cadence', unit: 'spm', format: round0('spm'), tick: int, minSpan: 6 },
  { key: 'groundContactTime', title: 'Ground contact time', unit: 'ms', format: round0('ms'), tick: int, minSpan: 20 },
  { key: 'efficiency', title: 'Efficiency', unit: 'm per heartbeat, 1 min means', format: (v) => `${v.toFixed(2)} m/beat`, tick: (v, d = 2) => v.toFixed(Math.max(2, d)), minSpan: 0.1 },
  { key: 'effortPace', title: 'Effort pace', unit: 'min/km, grade-adjusted', format: (v) => `${mmss(v)} /km`, tick: mmss, minSpan: 20, invert: true },
  { key: 'verticalOscillation', title: 'Vertical oscillation', unit: 'mm', format: round0('mm'), tick: int, minSpan: 10 },
  { key: 'stepLength', title: 'Step length', unit: 'mm', format: round0('mm'), tick: int, minSpan: 60 },
  { key: 'power', title: 'Power', unit: 'W', format: round0('W'), tick: int, minSpan: 20 },
  { key: 'legSpringStiffness', title: 'Leg spring stiffness', unit: 'kN/m', format: (v) => `${v.toFixed(1)} kN/m`, tick: (v, d = 1) => v.toFixed(Math.max(1, d)), minSpan: 1 },
  { key: 'altitude', title: 'Elevation', unit: 'm', format: round0('m'), tick: int, minSpan: 10 },
];

/**
 * Efficiency for drawing: the means of speed and of heart rate over a minute around each window
 * (stops left out), then their ratio, metres per beat. Heart rate follows the pace with a lag,
 * so the ratio of single 10 s windows jumps at every change of pace; over a minute it does not.
 */
function efficiencySeries(speed: (number | null)[], heartRate: (number | null)[], stopped: boolean[]): (number | null)[] {
  const mean = (v: (number | null)[], i: number) => {
    const xs: number[] = [];
    for (let k = Math.max(0, i - 3); k <= Math.min(v.length - 1, i + 3); k++) { const x = v[k]; if (x !== null && !stopped[k]) xs.push(x); }
    return xs.length >= 3 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  return speed.map((_, i) => efficiencyOf(mean(speed, i), mean(heartRate, i)));
}

/**
 * A metric for drawing: nothing at a stop or the windows on either side of it (slowing down,
 * speeding up), then the median of each window and its neighbours, so one odd window does not spike.
 */
function forDrawing(v: (number | null)[], stopped: boolean[]): (number | null)[] {
  const near = (i: number) => stopped[i] || stopped[i - 1] || stopped[i + 1];
  const kept = v.map((x, i) => (near(i) ? null : x));
  return kept.map((x, i) => {
    if (x === null) return null;
    const n = [kept[i - 1], x, kept[i + 1]].filter((y): y is number => y !== null && y !== undefined).sort((a, b) => a - b);
    return n[Math.floor(n.length / 2)];
  });
}
/** The value of a series at a time: that of the last window begun by then. */
function valueAt(x: number[], v: (number | null)[], at: number): number | null {
  let best = -1;
  for (let i = 0; i < x.length; i++) if (x[i] <= at) best = i;
  return best >= 0 ? v[best] : null;
}
const SHOWN_KEY = 'strideprism.runMetrics';
const DEFAULT_SHOWN: WindowKey[] = ['speed', 'heartRate', 'cadence', 'groundContactTime'];

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
  const [shown, setShown] = useState<WindowKey[]>(DEFAULT_SHOWN);
  const [lanes, lanesWidth] = useWidth();
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SHOWN_KEY) ?? 'null');
      if (Array.isArray(saved) && saved.length) setShown(saved);
    } catch { /* the default */ }
  }, []);
  const toggle = (k: WindowKey) => {
    const next = shown.includes(k) ? shown.filter((x) => x !== k) : METRICS.map((m) => m.key).filter((x) => x === k || shown.includes(x));
    setShown(next);
    try { localStorage.setItem(SHOWN_KEY, JSON.stringify(next)); } catch { /* not kept */ }
  };

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
    // The line breaks where the runner stood: a stop is no value of pace, cadence or heart rate.
    // Pace is drawn in s/km (its ticks are round in pace, not in m/s).
    const asPace = (v: (number | null)[]) => v.map((s) => (s !== null && s > 0 ? 1000 / s : null));
    const series = Object.fromEntries(METRICS.map((m) => {
      const raw = m.key === 'efficiency' ? efficiencySeries(w.speed, w.heartRate, w.flags.stopped) : (w[m.key] as (number | null)[]);
      return [m.key, forDrawing(m.key === 'speed' || m.key === 'effortPace' ? asPace(raw) : raw, w.flags.stopped)];
    })) as Record<WindowKey, (number | null)[]>;
    const hr = run.samples.heartRate.filter((v): v is number => v !== null);
    const avgHr = hr.length ? Math.round(hr.reduce((a, b) => a + b, 0) / hr.length) : null;
    // Elevation gain from the 10 s windows (smoothed by them), climbs of at least 1 m.
    let gain = 0;
    const alt = w.altitude.filter((v): v is number => v !== null);
    for (let i = 1; i < alt.length; i++) if (alt[i] - alt[i - 1] > 0) gain += alt[i] - alt[i - 1];
    return { w, x, flagged, laps, series, avgHr, gain: alt.length ? Math.round(gain) : null };
  }, [run]);

  const save = async (def: BlockDefinition) => {
    setCreating(true);
    await writeDefinitions(folder, [...(await readDefinitions(folder)), def]);
    await runInWorker('blocks', handle);
    router.push('/blocks');
  };
  const create = (type: BlockType) => run && selection && save(definitionFromSelection(run, selection.from, selection.to, type));

  if (run === undefined) return <div className="page muted">Loading…</div>;
  if (!run || !view) return <div className="page">Run not found. <Link href="/" className="muted">← Runs</Link></div>;
  const { x, laps, series } = view;
  const common = { x, laps, selection, onSelect: setSelection, blocks: blocks.map((b) => ({ from: b.start, to: b.end, ok: b.status === 'accepted', name: b.name })), cursor, onCursor: setCursor };
  const visible = METRICS.filter((m) => shown.includes(m.key) && series[m.key].some((v) => v !== null));
  // Under the cursor: the time, the distance and the lap.
  const at = cursor === null ? null : run.samples.t.findIndex((t) => t >= cursor);
  const atKm = at !== null && at >= 0 ? run.samples.distance[at] : null;
  const atLap = cursor === null ? -1 : run.laps.findIndex((l) => cursor >= l.start && cursor < l.end);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Link href="/">← Runs</Link></div>
          <h1>{date(run.startTime)} <span className="muted">· {time(run.startTime)}</span></h1>
        </div>
        <span className="spacer" />
        <span className="chip">{run.device}</span>
        <span className="chip">{run.laps.length} laps</span>
        {run.temperature !== null && <span className="chip">{run.temperature} °C</span>}
        <Link className="btn" href={`/analysis?items=r:${run.id}:0`}>Add to Analysis</Link>
      </div>
      <div className="stats card">
        <div className="stat"><div className="v">{km(run.distance)} km</div><div className="l">distance</div></div>
        <div className="stat"><div className="v">{duration(run.duration)}</div><div className="l">moving time</div></div>
        <div className="stat"><div className="v">{pace(run.distance / run.duration)} /km</div><div className="l">average pace</div></div>
        <div className="stat"><div className="v">{view.avgHr ?? '–'}{view.avgHr ? ' bpm' : ''}</div><div className="l">average heart rate</div></div>
        <div className="stat"><div className="v">{view.gain ?? '–'}{view.gain !== null ? ' m' : ''}</div><div className="l">elevation gain</div></div>
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
              </div>
            ))}
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            {canDefineFromLaps(run) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                <span className="muted small" style={{ flex: 1 }}>A test or a planned workout? Find the runs with the same laps, on any route.</span>
                <button className="btn" disabled={creating} onClick={() => save(definitionFromLaps(run))}>Block from these laps</button>
              </div>
            )}
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
        <div className="card metrics">
          <div className="metrics-bar">
            <div className="metric-picker" role="group" aria-label="Metrics shown">
              {METRICS.filter((m) => series[m.key].some((v) => v !== null)).map((m) => (
                <button key={m.key} className={`pill ${shown.includes(m.key) ? 'on' : ''}`} aria-pressed={shown.includes(m.key)} onClick={() => toggle(m.key)}>{m.title}</button>
              ))}
            </div>
            <span className="readout tnum" aria-live="polite">
              {cursor === null ? 'Hover a chart · drag to select a fragment' : `${clock(cursor)}${atKm !== null ? ` · ${km(atKm)} km` : ''}`}
            </span>
          </div>
          <div ref={lanes} className="lanes">
            {visible.map((m, i) => (
              <LineChart key={m.key} title={m.title} unit={m.unit} y={series[m.key]} format={m.format} tick={m.tick} minSpan={m.minSpan} invert={m.invert} labels={i === 0} axis={i === visible.length - 1} {...common} />
            ))}
            {cursor !== null && (() => {
              const cx = LANE.l + (cursor / (x[x.length - 1] || 1)) * (lanesWidth - LANE.l - LANE.r);
              const flip = cx > lanesWidth - 220;
              return (
                <div className="cursor-card" style={{ left: flip ? cx - 12 : cx + 12, transform: flip ? 'translateX(-100%)' : undefined }}>
                  <div className="cursor-time">{clock(cursor)}{atKm !== null ? ` · ${km(atKm)} km` : ''}{atLap >= 0 ? ` · lap ${atLap + 1}` : ''}</div>
                  {visible.map((m) => { const v = valueAt(x, series[m.key], cursor); return <div key={m.key} className="cursor-row"><span>{m.title}</span><b>{v === null ? '–' : m.format(v)}</b></div>; })}
                </div>
              );
            })()}
          </div>
          <div className="legend" style={{ margin: '8px 0 0' }}>
            <span><i style={{ background: 'var(--surface-2)' }} />alternate laps</span>
            <span><i style={{ background: 'var(--band)', borderTop: '2px solid var(--series-1)' }} />block instance (top line: accepted)</span>
            <span>gaps: stopped · lines: 10 s windows, median of 3</span>
          </div>
        </div>
      </div>
      {selection && (
        <div className="float-bar">
          <span>Selected min {(selection.from / 60).toFixed(1)}–{(selection.to / 60).toFixed(1)} · {Math.round(selection.to - selection.from)} s</span>
          <span className="muted">Create block definition as</span>
          {selectionOptions(run, selection.from, selection.to).map((t) => (
            <button key={t} className="btn primary" disabled={creating} onClick={() => create(t)}>{t === 'route' ? 'Route segment' : t === 'structure' ? 'Workout structure (lap)' : t === 'effort' ? 'Effort (time trial)' : 'Steady fragment'}</button>
          ))}
          <button className="btn icon" aria-label="Clear selection" onClick={() => setSelection(null)}>✕</button>
        </div>
      )}
    </div>
  );
}
