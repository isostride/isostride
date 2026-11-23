'use client';

import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { clock, ensureSpan, niceTicks, robustExtent, smoothPaths, useMetrics, useWidth } from '@/components';
import { figuresInWorker, type EffortFigures } from '@/lib/client';
import { date } from '@/lib/format';
import type { DataFolder } from '@/lib/fs';
import { readSettings, zoneColor, zoneRanges } from '@/lib/settings';

/** An effort chosen on the Efforts tab: where it is, and whether it is the selection compared from. */
export interface ChartEffort {
  runId: string;
  from: number;
  to: number;
  reference: boolean;
}

type Metric = string;
const DEFAULT_METRICS: Metric[] = ['speed', 'heartRate', 'cadence'];
const BAND = 118;
const GAP = 10;
const PAD = { l: 64, r: 16, t: 8, b: 30 };
/** Smoothed: the mean of each window and the two either side (about 50 s), as the run chart's smoothing. */
const SMOOTH = 2;

function smooth(ys: (number | null)[], on: boolean): (number | null)[] {
  if (!on) return ys;
  return ys.map((v, i) => {
    if (v === null) return null;
    let s = 0;
    let n = 0;
    for (let k = Math.max(0, i - SMOOTH); k <= Math.min(ys.length - 1, i + SMOOTH); k++) { const y = ys[k]; if (y !== null) { s += y; n++; } }
    return s / n;
  });
}

/**
 * The efforts chosen on the Efforts tab of Compare, on one chart as rich as the run's (the runner's
 * request of 22 Nov 2026: "w sekcji efforts i wykresy - wygladaja ubogo ... maja byc tak rozbudowane
 * jak w sekcji runs"): the metrics chosen, each in its band on one scale for every effort with its
 * zones washed behind, by distance or time from each effort's start, smoothed or raw; a cursor across
 * the bands with every effort's values; and a table of each effort's figures under it. The selection
 * compared from is drawn in ink, the others in the colours of the series.
 */
export function EffortsChart({ efforts, handle, folder }: { efforts: ChartEffort[]; handle: FileSystemDirectoryHandle; folder: DataFolder }) {
  const [figures, setFigures] = useState<Record<string, EffortFigures> | null>(null);
  const [zones, setZones] = useState<Record<string, number[]>>({});
  const [metrics, setMetrics] = useState<Metric[]>(DEFAULT_METRICS);
  // The metrics of the chart, as the run chart offers them: those of the folder's segments and the elevation.
  const known = useMetrics();
  const METRICS = [...known.blockKeys, 'altitude'].map(known.view);
  const [axis, setAxis] = useState<'distance' | 'time'>('distance');
  const [smoothed, setSmoothed] = useState(true);
  const [cursor, setCursor] = useState<number | null>(null);
  const [box, width] = useWidth(900);
  const key = JSON.stringify(efforts.map((e) => ({ runId: e.runId, from: e.from, to: e.to })));
  useEffect(() => {
    const controller = new AbortController();
    figuresInWorker(JSON.parse(key), handle, controller.signal).then(setFigures).catch(() => undefined);
    return () => controller.abort();
  }, [key, handle]);
  useEffect(() => { readSettings(folder).then((s) => setZones(s.zones)).catch(() => undefined); }, [folder]);

  // The efforts drawn: the selection first, in ink; the others in the colours of the series.
  const lines = useMemo(() => {
    if (!figures) return [];
    let k = 0;
    return [...efforts].sort((a, b) => Number(b.reference) - Number(a.reference)).flatMap((e) => {
      const f = figures[`${e.runId}:${e.from}`];
      return f ? [{ e, f, color: e.reference ? 'var(--text)' : `var(--series-${++k})`, name: e.reference ? `This selection · ${date(f.runStart)}` : date(f.runStart) }] : [];
    });
  }, [figures, efforts]);

  // The width is read from a box that is there from the first render, the chart's or its message.
  if (!figures || !lines.length) return <div ref={box} className="card effort-chart muted small" role="status">{figures ? 'No distance in these efforts to draw.' : 'Reading the efforts…'}</div>;

  // The plot spans the card, less its padding.
  const w = Math.max(320, width - 28);
  const xOf = (l: (typeof lines)[number]) => (axis === 'distance' ? l.f.series.d : l.f.series.t);
  const xMax = Math.max(...lines.map((l) => { const xs = xOf(l); return xs.length ? xs[xs.length - 1] : 0; }), 1);
  const px = (x: number) => PAD.l + (x / xMax) * (w - PAD.l - PAD.r);
  const has = (m: Metric) => lines.some((l) => l.f.series.values[m]?.some((v) => v !== null));
  const shown = metrics.filter(has);
  const H = PAD.t + shown.length * (BAND + GAP) + PAD.b;
  const bands = shown.map((m, k) => {
    const view = METRICS.find((x) => x.key === m)!;
    const ys = lines.map((l) => smooth(l.f.series.values[m] ?? [], smoothed));
    const all = ys.flat().filter((v): v is number => v !== null);
    const [lo, hi] = ensureSpan(...robustExtent(all, 0.03, 0.1), view.minSpan);
    const top = PAD.t + k * (BAND + GAP);
    const py = (v: number) => { const f = (Math.min(Math.max(v, lo), hi) - lo) / (hi - lo); return top + (view.invert ? f : 1 - f) * BAND; };
    const paths = lines.map((l, i) => smoothPaths(xOf(l).map((x, j) => (ys[i][j] === null ? null : [px(x), py(ys[i][j]!)] as [number, number])), top + BAND).line);
    const ranges = zones[m]?.length ? zoneRanges(m, zones[m]) : [];
    const stripes = ranges.flatMap((r, z) => {
      const a = Math.max(r.lo ?? -Infinity, lo);
      const b = Math.min(r.hi ?? Infinity, hi);
      if (b <= a) return [];
      const y1 = Math.min(py(a), py(b));
      const y2 = Math.max(py(a), py(b));
      return [{ z, n: ranges.length, y: y1, h: y2 - y1 }];
    });
    return { m, view, ys, top, py, paths, stripes, ticks: niceTicks(lo, hi, 3).filter((t) => t >= lo && t <= hi) };
  });
  const xTicks = niceTicks(0, axis === 'distance' ? xMax / 1000 : xMax / 60, 6).map((v) => (axis === 'distance' ? v * 1000 : v * 60)).filter((v) => v <= xMax);
  const xLabel = (v: number) => (axis === 'distance' ? `${+(v / 1000).toFixed(2)} km` : clock(v));
  /** Each effort's value of a metric nearest the cursor. */
  const at = (i: number, ys: (number | null)[]) => {
    if (cursor === null) return null;
    const xs = xOf(lines[i]);
    let best = -1;
    for (let j = 0; j < xs.length; j++) if (best < 0 || Math.abs(xs[j] - cursor) < Math.abs(xs[best] - cursor)) best = j;
    return best >= 0 && Math.abs(xs[best] - cursor) <= xMax * 0.03 ? ys[best] : null;
  };
  const move = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left - PAD.l) / (w - PAD.l - PAD.r)) * xMax;
    setCursor(x >= 0 && x <= xMax ? x : null);
  };

  return (
    <div ref={box} className="card effort-chart">
      <div className="effort-chart-head">
        <span className="chart-title">Efforts compared</span>
        <span className="spacer" />
        <div className="segmented" role="radiogroup" aria-label="Along">
          {(['distance', 'time'] as const).map((a) => <button key={a} type="button" role="radio" aria-checked={axis === a} className={axis === a ? 'on' : ''} onClick={() => setAxis(a)}>{a === 'distance' ? 'Distance' : 'Time'}</button>)}
        </div>
        <label className="setting inline"><input type="checkbox" checked={smoothed} onChange={(e) => setSmoothed(e.target.checked)} /> Smoothed</label>
      </div>
      <div className="effort-chart-metrics">
        <div className="metric-picker" role="group" aria-label="Metrics drawn">
          {METRICS.filter((x) => has(x.key)).map((x) => (
            <button key={x.key} type="button" className={`pill ${metrics.includes(x.key) ? 'on' : ''}`} aria-pressed={metrics.includes(x.key)}
              onClick={() => setMetrics((ms) => (ms.includes(x.key) ? (ms.length > 1 ? ms.filter((y) => y !== x.key) : ms) : METRICS.map((y) => y.key).filter((y) => y === x.key || ms.includes(y))))}>{x.short}</button>
          ))}
        </div>
      </div>
      <div className="effort-legend" role="list" aria-label="Efforts drawn">
        {lines.map((l) => <span key={`${l.e.runId}:${l.e.from}`} role="listitem"><i style={{ background: l.color }} aria-hidden="true" />{l.name}</span>)}
      </div>
      <div className="effort-plot">
        <svg role="img" aria-label={`${shown.map((m) => METRICS.find((x) => x.key === m)!.short).join(', ')} of ${lines.length} effort${lines.length === 1 ? '' : 's'}, by ${axis}`} width={w} height={H}
          onMouseMove={move} onMouseLeave={() => setCursor(null)}>
          {bands.map((b) => (
            <g key={b.m} className="effort-band" data-metric={b.m}>
              {b.stripes.map((s) => <rect key={s.z} x={PAD.l} y={s.y} width={w - PAD.l - PAD.r} height={s.h} fill={zoneColor(s.z, s.n)} opacity={0.14} className="zone-stripe" />)}
              {b.ticks.map((t) => (
                <g key={t}>
                  <line x1={PAD.l} x2={w - PAD.r} y1={b.py(t)} y2={b.py(t)} stroke="var(--grid)" />
                  <text x={PAD.l - 6} y={b.py(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tnum">{b.view.tick(t)}</text>
                </g>
              ))}
              <text x={PAD.l} y={b.top + 12} fontSize="11.5" fontWeight="650" fill="var(--text)">{b.view.short}</text>
              {b.paths.map((d, i) => <path key={i} d={d} fill="none" stroke={lines[i].color} strokeWidth={lines[i].e.reference ? 2.4 : 1.8} strokeLinejoin="round" strokeLinecap="round" />)}
            </g>
          ))}
          {xTicks.map((v) => <text key={v} x={px(v)} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--muted)" className="tnum">{xLabel(v)}</text>)}
          {cursor !== null && <line x1={px(cursor)} x2={px(cursor)} y1={PAD.t} y2={H - PAD.b + 4} stroke="var(--axis-strong)" strokeDasharray="3 3" />}
        </svg>
        {cursor !== null && (
          <div className="tooltip cursor-card effort-card" style={{ left: Math.min(w - 230, px(cursor) + 14) }}>
            <b className="tnum">{xLabel(cursor)}</b>
            {bands.map((b) => (
              <div key={b.m} className="effort-card-row">
                <span className="muted effort-card-label">{b.view.short}</span>
                {lines.map((l, i) => { const v = at(i, b.ys[i]); return <span key={i} className="tnum"><i style={{ background: l.color }} aria-hidden="true" />{v === null ? '–' : b.view.fmt(v)}</span>; })}
              </div>
            ))}
          </div>
        )}
      </div>
      <EffortsFigures lines={lines} metrics={shown} />
    </div>
  );
}

/** Each effort's figures under the chart: time, distance, climb, and the average, lowest and highest of each metric drawn. */
function EffortsFigures({ lines, metrics }: { lines: { e: ChartEffort; f: EffortFigures; color: string; name: string }[]; metrics: Metric[] }) {
  const { view } = useMetrics();
  const stat = (ys: (number | null)[]) => {
    const v = ys.filter((y): y is number => y !== null);
    return v.length ? { avg: v.reduce((a, b) => a + b, 0) / v.length, min: Math.min(...v), max: Math.max(...v) } : null;
  };
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Figures of the efforts drawn">
      <table className="data effort-figures">
        <thead>
          <tr>
            <th scope="col">Effort</th>
            <th scope="col" className="num">Time</th>
            <th scope="col" className="num">Distance</th>
            <th scope="col" className="num">Climb</th>
            {metrics.map((m) => <th key={m} scope="col" className="num">{view(m).short}</th>)}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={`${l.e.runId}:${l.e.from}`} className={l.e.reference ? 'reference' : ''}>
              <td><span className="effort-name"><i style={{ background: l.color }} aria-hidden="true" />{l.name}</span></td>
              <td className="num tnum">{clock(l.f.moving)}</td>
              <td className="num tnum">{(l.f.distance / 1000).toFixed(2)} km</td>
              <td className="num tnum">{l.f.ascent === null ? '–' : `${l.f.ascent} m`}</td>
              {metrics.map((m) => {
                const mv = view(m);
                const s = stat(l.f.series.values[m] ?? []);
                return <td key={m} className="num tnum">{s ? <><b>{mv.fmt(s.avg)}</b><span className="muted small effort-range">{mv.tick(mv.invert ? s.max : s.min)}–{mv.tick(mv.invert ? s.min : s.max)}</span></> : '–'}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
