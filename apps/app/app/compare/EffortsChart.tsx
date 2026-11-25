'use client';

import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { clock, ensureSpan, niceTicks, robustExtent, smoothPaths, useMetrics, useWidth } from '@/components';
import { figuresInWorker, type EffortFigures } from '@/lib/client';
import { date, time } from '@/lib/format';
import type { DataFolder } from '@/lib/fs';
import { number, t, tn } from '@/lib/i18n';
import { readSettings, zoneColor, zoneRanges } from '@/lib/settings';

/** An effort chosen on the Efforts tab: where it is, and whether it is the selection compared from. */
export interface ChartEffort {
  runId: string;
  from: number;
  to: number;
  reference: boolean;
  /** efforts of one group (a run) drawn as one line, their mean window by window ("Wybór biegów") */
  group?: string;
}

/**
 * Efforts averaged into one: each 10 s window from their start the mean of theirs (as many windows as the
 * shortest has), each figure the mean of theirs; the first's run and title.
 */
function averaged(fs: EffortFigures[]): EffortFigures {
  if (fs.length === 1) return fs[0];
  const n = Math.min(...fs.map((f) => f.series.t.length));
  const mean = (xs: (number | null | undefined)[]) => { const v = xs.filter((x): x is number => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const keys = [...new Set(fs.flatMap((f) => Object.keys(f.series.values)))];
  const series = {
    d: Array.from({ length: n }, (_, j) => mean(fs.map((f) => f.series.d[j])) ?? 0),
    t: Array.from({ length: n }, (_, j) => mean(fs.map((f) => f.series.t[j])) ?? 0),
    values: Object.fromEntries(keys.map((k) => [k, Array.from({ length: n }, (_, j) => mean(fs.map((f) => f.series.values[k]?.[j])))])),
  };
  const first = fs[0] as unknown as Record<string, unknown>;
  // Each figure the mean of theirs, kept to a tenth (a climb of 4.7 m, not 4.666… m).
  const tenth = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);
  const figures = Object.fromEntries(Object.keys(first).filter((k) => k !== 'series').map((k) => [k, typeof first[k] === 'number' ? tenth(mean(fs.map((f) => (f as unknown as Record<string, unknown>)[k] as number))) : first[k]]));
  return { ...(figures as unknown as EffortFigures), series };
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
export function EffortsChart({ efforts, handle, folder, metrics: given }: { efforts: ChartEffort[]; handle: FileSystemDirectoryHandle; folder: DataFolder; /** the metrics drawn, chosen above the chart (its own pills left out) */ metrics?: Metric[] }) {
  const [figures, setFigures] = useState<Record<string, EffortFigures> | null>(null);
  const [zones, setZones] = useState<Record<string, number[]>>({});
  const [own, setMetrics] = useState<Metric[]>(DEFAULT_METRICS);
  const metrics = given ?? own;
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

  // The efforts drawn: the selection first, in ink; the others in the colours of the series. Efforts of one
  // group (a run) as one line, their mean, named by the run and how many.
  const lines = useMemo(() => {
    if (!figures) return [];
    let k = 0;
    const units: { e: ChartEffort; fs: EffortFigures[]; n: number }[] = [];
    for (const e of efforts) {
      const f = figures[`${e.runId}:${e.from}`];
      if (!f) continue;
      const u = e.group ? units.find((x) => x.e.group === e.group) : undefined;
      if (u) { u.fs.push(f); u.n++; if (e.reference) u.e = { ...u.e, reference: true }; } else units.push({ e, fs: [f], n: 1 });
    }
    return units.sort((a, b) => Number(b.e.reference) - Number(a.e.reference)).map(({ e, fs, n }) => {
      const f = averaged(fs);
      // Two runs of one day told apart by their time.
      const day = units.filter((u) => u.fs[0] && date(u.fs[0].runStart) === date(f.runStart)).length > 1 ? `${date(f.runStart)} · ${time(f.runStart)}` : date(f.runStart);
      const name = e.reference ? t('This selection · {date}', { date: day }) : day;
      return { e, f, color: e.reference ? 'var(--text)' : `var(--series-${++k})`, name: n > 1 ? `${name} · ${tn(n, 'mean of {n} effort', 'mean of {n} efforts')}` : name };
    });
  }, [figures, efforts]);

  // The width is read from a box that is there from the first render, the chart's or its message.
  if (!figures || !lines.length) return <div ref={box} className="card effort-chart muted small" role="status">{figures ? t('No distance in these efforts to draw.') : t('Reading the efforts…')}</div>;

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
  const xLabel = (v: number) => (axis === 'distance' ? `${number(+(v / 1000).toFixed(2))} km` : clock(v));
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

  const shownNames = shown.map((m) => METRICS.find((x) => x.key === m)!.short).join(', ');
  return (
    <div ref={box} className="card effort-chart">
      <div className="effort-chart-head">
        <span className="chart-title">{t('Efforts compared')}</span>
        <span className="spacer" />
        <div className="segmented" role="radiogroup" aria-label={t('Along')}>
          {(['distance', 'time'] as const).map((a) => <button key={a} type="button" role="radio" aria-checked={axis === a} className={axis === a ? 'on' : ''} onClick={() => setAxis(a)}>{a === 'distance' ? t('Distance') : t('Time')}</button>)}
        </div>
        <label className="setting inline"><input type="checkbox" checked={smoothed} onChange={(e) => setSmoothed(e.target.checked)} /> {t('Smoothed')}</label>
      </div>
      {!given && <div className="effort-chart-metrics">
        <div className="metric-picker" role="group" aria-label={t('Metrics drawn')}>
          {METRICS.filter((x) => has(x.key)).map((x) => (
            <button key={x.key} type="button" className={`pill ${metrics.includes(x.key) ? 'on' : ''}`} aria-pressed={metrics.includes(x.key)}
              onClick={() => setMetrics((ms) => (ms.includes(x.key) ? (ms.length > 1 ? ms.filter((y) => y !== x.key) : ms) : METRICS.map((y) => y.key).filter((y) => y === x.key || ms.includes(y))))}>{x.short}</button>
          ))}
        </div>
      </div>}
      <div className="effort-legend" role="list" aria-label={t('Efforts drawn')}>
        {lines.map((l) => <span key={`${l.e.runId}:${l.e.from}`} role="listitem"><i style={{ background: l.color }} aria-hidden="true" />{l.name}</span>)}
      </div>
      <div className="effort-plot">
        <svg role="img" aria-label={axis === 'distance' ? tn(lines.length, '{metrics} of {n} effort, by distance', '{metrics} of {n} efforts, by distance', { metrics: shownNames }) : tn(lines.length, '{metrics} of {n} effort, by time', '{metrics} of {n} efforts, by time', { metrics: shownNames })} width={w} height={H}
          onMouseMove={move} onMouseLeave={() => setCursor(null)}>
          {bands.map((b) => (
            <g key={b.m} className="effort-band" data-metric={b.m}>
              {b.stripes.map((s) => <rect key={s.z} x={PAD.l} y={s.y} width={w - PAD.l - PAD.r} height={s.h} fill={zoneColor(s.z, s.n)} opacity={0.14} className="zone-stripe" />)}
              {b.ticks.map((v) => (
                <g key={v}>
                  <line x1={PAD.l} x2={w - PAD.r} y1={b.py(v)} y2={b.py(v)} stroke="var(--grid)" />
                  <text x={PAD.l - 6} y={b.py(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tnum">{b.view.tick(v)}</text>
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
    <div className="table-scroll" tabIndex={0} role="region" aria-label={t('Figures of the efforts drawn')}>
      <table className="data effort-figures">
        <thead>
          <tr>
            <th scope="col">{t('Effort')}</th>
            <th scope="col" className="num">{t('Time')}</th>
            <th scope="col" className="num">{t('Distance')}</th>
            <th scope="col" className="num">{t('Climb')}</th>
            {metrics.map((m) => <th key={m} scope="col" className="num">{view(m).short}</th>)}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={`${l.e.runId}:${l.e.from}`} className={l.e.reference ? 'reference' : ''}>
              <td><span className="effort-name"><i style={{ background: l.color }} aria-hidden="true" />{l.name}</span></td>
              <td className="num tnum">{clock(l.f.moving)}</td>
              <td className="num tnum">{number(l.f.distance / 1000, 2)} km</td>
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
