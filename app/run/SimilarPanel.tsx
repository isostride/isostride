'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { niceTicks, robustExtent, useWidth } from '@/components';
import { similarInWorker, type SimilarResult, type SimilarStretch } from '@/lib/client';
import { definitionFromProfile, definitionFromRoute, type BlockDefinition } from '@/lib/blocks';
import { date } from '@/lib/format';

type Tab = 'route' | 'profile';
type Metric = 'pace' | 'heartRate' | 'altitude';

/** The most stretches drawn with the selection (model's choice): four colours of the series. */
const MAX_CHOSEN = 4;
const mmss = (v: number) => { const r = Math.round(Math.abs(v)); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; };
const keyOf = (s: SimilarStretch) => `${s.runId}:${s.from}`;
const pct = (x: number) => `${Math.round(x * 100)} %`;
const METRIC: Record<Metric, { title: string; format: (v: number) => string; invert?: boolean }> = {
  pace: { title: 'Pace', format: (v) => `${mmss(v)} /km`, invert: true },
  heartRate: { title: 'Heart rate', format: (v) => `${Math.round(v)} bpm` },
  altitude: { title: 'Elevation', format: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v))} m` },
};

/** A stretch's values of a metric, by the share of its distance (0–1). */
function seriesOf(s: SimilarStretch, m: Metric): { f: number; v: number }[] {
  const c = s.curves;
  if (m === 'altitude') return (c.altitude ?? []).map((v, k, xs) => ({ f: k / (xs.length - 1), v }));
  const ys = m === 'pace' ? c.pace : c.heartRate;
  return ys.flatMap((v, k) => (v === null ? [] : [{ f: (k + 0.5) / ys.length, v }]));
}

/**
 * Stretches like the one selected, in other runs (the runner's request of 22 Nov 2026: "otwieram
 * wczorajszy bieg, zaznaczam fragment i klikam przycisk... mam podglad innych segmentow w innych
 * biegach z ktorymi moge porownac"; requirement "Similar stretches of a selection"): those over the
 * same route and those of the same profile on other routes, each with its difference from the
 * selection; the ones chosen drawn with the selection by distance; either list kept as a block.
 */
export function SimilarPanel({ runId, from, to, handle, selection, onSearch, onKeep, onClose, keeping }: {
  runId: string;
  from: number;
  to: number;
  handle: FileSystemDirectoryHandle;
  /** the selection now, when it is not the one searched */
  selection: { from: number; to: number } | null;
  onSearch: () => void;
  onKeep: (def: BlockDefinition) => void;
  onClose: () => void;
  keeping: boolean;
}) {
  const [result, setResult] = useState<SimilarResult | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('route');
  /** the stretches drawn, per list: those of the list shown are drawn */
  const [picked, setPicked] = useState<Record<Tab, string[]>>({ route: [], profile: [] });
  const [metric, setMetric] = useState<Metric>('pace');

  useEffect(() => {
    const ctrl = new AbortController();
    setResult(null); setError(null); setProgress(null);
    similarInWorker({ runId, from, to }, handle, (p) => setProgress({ done: p.done, total: p.total }), ctrl.signal)
      .then((r) => {
        setResult(r);
        // The same route first when it has any; the newest two (or the two most alike) drawn at once.
        const t: Tab = r.route.length || !r.profile.length ? 'route' : 'profile';
        setTab(t);
        setPicked({ route: r.route.slice(0, 2).map(keyOf), profile: r.profile.slice(0, 2).map(keyOf) });
      })
      .catch((e: unknown) => { if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : String(e)); });
    return () => ctrl.abort();
  }, [runId, from, to, handle]);

  const rows = useMemo(() => (result ? result[tab] : []), [result, tab]);
  const chosen = picked[tab];
  const drawn = chosen.map((k) => rows.find((s) => keyOf(s) === k)).filter((s): s is SimilarStretch => !!s);
  const toggle = (s: SimilarStretch) => {
    const k = keyOf(s);
    setPicked((p) => ({ ...p, [tab]: p[tab].includes(k) ? p[tab].filter((x) => x !== k) : p[tab].length >= MAX_CHOSEN ? p[tab] : [...p[tab], k] }));
  };
  const ref = result?.reference ?? null;
  const titled = rows.some((r) => r.title);
  const changed = selection && (selection.from !== from || selection.to !== to);

  return (
    <section className="card similar" aria-label="Similar stretches">
      <div className="similar-head">
        <h3>Similar stretches</h3>
        {ref && <span className="muted tnum">to {(ref.distance / 1000).toFixed(2)} km · {mmss(ref.moving)} · {METRIC.pace.format(ref.pace)}{ref.ascent !== null ? ` · ${ref.ascent} m up` : ''}</span>}
        <span className="spacer" />
        {changed && <button type="button" className="btn sm" onClick={onSearch}>Search the selection now</button>}
        <button type="button" className="btn sm icon" aria-label="Close similar stretches" onClick={onClose}>✕</button>
      </div>
      {error && <p className="small similar-error" role="alert">{error}</p>}
      {!result && !error && (
        <p className="muted small" role="status">Reading the runs… {progress && progress.total ? `${progress.done} of ${progress.total}` : ''}</p>
      )}
      {result?.why && <p className="muted small">{result.why}</p>}
      {result && !result.why && (
        <>
          <div className="tabs similar-tabs" role="tablist" aria-label="Similar by">
            {([['route', 'Same route', result.route.length], ['profile', 'Same profile', result.profile.length]] as const).map(([t, name, n]) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
                {name} <span className="tab-count">· {n}</span>
              </button>
            ))}
          </div>
          <p className="muted small similar-what">
            {tab === 'route'
              ? (result.track.length ? 'Other runs over this stretch of route, the same way, at any pace; newest first.' : 'The selection has no GPS track: there is no route to follow.')
              : 'Stretches of the same distance on other routes, by how alike their terrain, the shape of their pace and its level are; most alike first. Runs over the same route are under Same route.'}
          </p>
          {ref && drawn.length > 0 && (
            <OverlayChart reference={ref} stretches={drawn} metric={metric} onMetric={setMetric} />
          )}
          {rows.length > 0 ? (
            <div className="table-scroll similar-list" tabIndex={0} role="region" aria-label={tab === 'route' ? 'Stretches of the same route' : 'Stretches of the same profile'}>
              <table className="data similar-table">
                <thead>
                  <tr>
                    <th scope="col"><span className="sr-only">Compare</span></th>
                    <th scope="col">Date</th>
                    {titled && <th scope="col">Run</th>}
                    <th scope="col" className="num">Time</th>
                    <th scope="col" className="num" title="Its moving time against the selection's">vs this</th>
                    <th scope="col" className="num">Pace</th>
                    <th scope="col" className="num">HR</th>
                    <th scope="col" className="num">Climb</th>
                    {tab === 'profile' && <th scope="col" className="num">Alike</th>}
                    <th scope="col" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const k = keyOf(s);
                    const i = chosen.indexOf(k);
                    const d = ref ? s.moving - ref.moving : 0;
                    const full = !chosen.includes(k) && chosen.length >= MAX_CHOSEN;
                    return (
                      <tr key={k} className={i >= 0 ? 'on' : ''}>
                        <td>
                          <label className="similar-pick" title={full ? `At most ${MAX_CHOSEN} at once` : 'Draw it with the selection'}>
                            <input type="checkbox" checked={i >= 0} disabled={full} onChange={() => toggle(s)} aria-label={`Compare ${date(s.runStart)}`} />
                            {i >= 0 && <i style={{ background: `var(--series-${i + 1})` }} aria-hidden="true" />}
                          </label>
                        </td>
                        <td className="strong">{date(s.runStart)}</td>
                        {titled && <td>{s.title ?? <span className="muted">–</span>}</td>}
                        <td className="num tnum">{mmss(s.moving)}</td>
                        <td className="num tnum">{ref ? `${d > 0 ? '+' : d < 0 ? '−' : '±'}${mmss(d)}` : '–'}</td>
                        <td className="num tnum">{METRIC.pace.format(s.pace)}</td>
                        <td className="num tnum">{s.heartRate === null ? '–' : Math.round(s.heartRate)}</td>
                        <td className="num tnum">{s.ascent === null ? '–' : `${s.ascent} m`}</td>
                        {tab === 'profile' && (
                          <td className="num tnum" title={`terrain ${s.parts?.terrain === null || !s.parts ? 'unknown' : pct(s.parts.terrain)} · pace shape ${s.parts ? pct(s.parts.shape) : '–'} · pace level ${s.parts ? pct(s.parts.level) : '–'}`}>
                            {pct(s.score ?? 0)}
                            <span className="muted similar-parts">terrain {s.parts?.terrain == null ? '–' : pct(s.parts.terrain)} · shape {s.parts ? pct(s.parts.shape) : '–'} · level {s.parts ? pct(s.parts.level) : '–'}</span>
                          </td>
                        )}
                        <td className="num"><Link className="row-open" href={`/run?id=${s.runId}&from=${s.from}&to=${s.to}`}>Open →</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted small">{tab === 'route' ? 'No other run passes over this stretch.' : 'No stretch of another run is alike enough (a score of 60 %).'}</p>
          )}
          <div className="similar-foot">
            {tab === 'route' && result.track.length > 0 && (
              <button type="button" className="btn sm primary" disabled={keeping} onClick={() => onKeep(definitionFromRoute(result.track))}>Keep the same route as a block</button>
            )}
            {tab === 'profile' && result.key && (
              <button type="button" className="btn sm primary" disabled={keeping} onClick={() => onKeep(definitionFromProfile(result.key!))}>Keep this profile as a block</button>
            )}
            <span className="muted small">A block follows these stretches in Analysis: their trend over time, A/B and every run to come.</span>
          </div>
        </>
      )}
    </section>
  );
}

const H = 220;
const PAD = { l: 52, r: 14, t: 12, b: 28 };

/** The selection and the stretches chosen, by the share of the selection's distance, one metric at a time. */
function OverlayChart({ reference, stretches, metric, onMetric }: { reference: SimilarStretch; stretches: SimilarStretch[]; metric: Metric; onMetric: (m: Metric) => void }) {
  const [box, width] = useWidth(720);
  const [hover, setHover] = useState<number | null>(null);
  const m = METRIC[metric];
  const lines = [{ s: reference, color: 'var(--text)', name: 'This selection' }, ...stretches.map((s, i) => ({ s, color: `var(--series-${i + 1})`, name: date(s.runStart) }))];
  const series = lines.map((l) => seriesOf(l.s, metric));
  const values = series.flat().map((p) => p.v);
  const has = (k: Metric) => [reference, ...stretches].some((s) => seriesOf(s, k).length > 0);
  const [lo, hi] = values.length ? robustExtent(values, 0, 0.08) : [0, 1];
  const ticks = niceTicks(lo, hi, 4);
  const w = Math.max(200, width);
  const D = reference.distance;
  const xOf = (f: number) => PAD.l + f * (w - PAD.l - PAD.r);
  // Pace upside down: faster higher.
  const yOf = (v: number) => {
    const r = (v - lo) / (hi - lo || 1);
    return PAD.t + (m.invert ? r : 1 - r) * (H - PAD.t - PAD.b);
  };
  const path = (ps: { f: number; v: number }[]) => ps.map((p, i) => `${i ? 'L' : 'M'}${xOf(p.f).toFixed(1)},${yOf(p.v).toFixed(1)}`).join('');
  const nearest = (ps: { f: number; v: number }[], f: number) => ps.reduce<{ f: number; v: number } | null>((b, p) => (!b || Math.abs(p.f - f) < Math.abs(b.f - f) ? p : b), null);
  const kmTicks = niceTicks(0, D / 1000, 5).filter((k) => k <= D / 1000 + 1e-9);

  return (
    <div className="similar-chart">
      <div className="similar-chart-head">
        <div className="segmented" role="radiogroup" aria-label="Compare by">
          {(Object.keys(METRIC) as Metric[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={metric === k} className={metric === k ? 'on' : ''} disabled={!has(k)} onClick={() => onMetric(k)}>{METRIC[k].title}</button>
          ))}
        </div>
        <div className="similar-legend" role="list" aria-label="Stretches drawn">
          {lines.map((l, i) => (
            <span key={i} role="listitem"><i style={{ background: l.color }} aria-hidden="true" />{l.name}</span>
          ))}
        </div>
      </div>
      <div ref={box} className="similar-plot">
        <svg role="img" aria-label={`${m.title} of the selection and ${stretches.length} like it, by distance`} width={w} height={H}
          onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const f = (e.clientX - r.left - PAD.l) / (w - PAD.l - PAD.r); setHover(f >= 0 && f <= 1 ? f : null); }}
          onPointerLeave={() => setHover(null)}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={w - PAD.r} y1={yOf(v)} y2={yOf(v)} stroke="var(--grid)" />
              <text x={PAD.l - 6} y={yOf(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tnum">{metric === 'pace' ? mmss(v) : metric === 'altitude' ? `${Math.round(v)}` : Math.round(v)}</text>
            </g>
          ))}
          {kmTicks.map((k) => (
            <text key={k} x={xOf((k * 1000) / D)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)" className="tnum">{k.toFixed(k % 1 ? 1 : 0)} km</text>
          ))}
          {series.map((ps, i) => ps.length > 1 && (
            <path key={i} d={path(ps)} fill="none" stroke={lines[i].color} strokeWidth={i === 0 ? 2.5 : 2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {hover !== null && <line x1={xOf(hover)} x2={xOf(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--axis-strong)" strokeDasharray="3 3" />}
        </svg>
        {hover !== null && (
          <div className="tooltip similar-tip" style={{ left: Math.min(w - 180, xOf(hover) + 12) }}>
            <b className="tnum">{((hover * D) / 1000).toFixed(2)} km</b>
            {lines.map((l, i) => {
              const p = nearest(series[i], hover);
              return p && <span key={i}><i style={{ background: l.color }} aria-hidden="true" />{l.name}: <b className="tnum">{m.format(p.v)}</b></span>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
