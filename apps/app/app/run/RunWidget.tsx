'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { RunChart, clampDomain, clock, rollingMean, smoothSpan, type Domain, type RunLine } from '@/components';
import { PATHS, readJson, type DataFolder, readRunFile } from '@/lib/fs';
import { duration, km, pace } from '@/lib/format';
import type { RunFile } from '@/lib/kernel';
import { runMetric, seriesOf, type WindowKey } from './metrics';

const DEFAULT: WindowKey[] = ['speed', 'heartRate', 'cadence', 'groundContactTime'];

/**
 * A run's chart as a widget of the Dashboard (the runner's "Pin na kazdej karcie-widgecie": there
 * as on its screen): the metrics shown when it was pinned, each in its band, the laps over it;
 * dragged across, it zooms to the stretch, and a double click shows the whole run again.
 */
export function RunWidget({ folder, id, metrics }: { folder: DataFolder; id: string; /** the metrics shown, "speed,heartRate" */ metrics?: string }) {
  const [run, setRun] = useState<RunFile | null | undefined>(undefined);
  const [focus, setFocus] = useState<string | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [zoom, setZoom] = useState<Domain | null>(null);
  useEffect(() => {
    let live = true;
    readRunFile(folder, id).then((f) => live && setRun(f)).catch(() => live && setRun(null));
    return () => { live = false; };
  }, [folder, id]);

  const view = useMemo(() => {
    if (!run) return null;
    const w = run.windows;
    const step = w.start.length > 1 ? w.start[1] - w.start[0] : 10;
    const x = w.start.map((s) => s + step / 2);
    const total = w.start.length ? w.start[w.start.length - 1] + step : 1;
    return { x, total, series: seriesOf(run), laps: run.laps.map((l, i) => ({ from: l.start, to: l.end, label: `Lap ${i + 1} · ${km(l.distance)} km`, short: `Lap ${i + 1}` })) };
  }, [run]);

  if (run === undefined) return <p className="muted small" role="status">Reading the run…</p>;
  if (!run || !view) return <p className="muted small">This run is not there any more.</p>;
  const keys = (metrics ? metrics.split(',') : DEFAULT).filter((k): k is WindowKey => !!view.series[k]);
  const domain: Domain = zoom ?? [0, view.total];
  const span = smoothSpan(domain[1] - domain[0]);
  const lines: RunLine[] = keys.flatMap((k, i) => {
    const m = runMetric(k, run.metrics);
    return view.series[k].some((v) => v !== null) ? [{ key: m.key, title: m.title, short: m.short, unit: m.unit, y: rollingMean(view.x, view.series[k], span), color: `var(--series-${i + 1})`, format: m.format, tick: m.tick, minSpan: m.minSpan, invert: m.invert, steps: m.steps }] : [];
  });
  const head = (t: number) => {
    const i = run.samples.t.findIndex((s) => s >= t);
    return `${clock(t)}${i >= 0 && run.samples.distance[i] !== null ? ` · ${km(run.samples.distance[i]!)} km` : ''}`;
  };
  return (
    <div className="dash-run" onDoubleClick={() => setZoom(null)}>
      <div className="dash-figures">
        <span><b className="tnum">{km(run.distance)}</b> km</span>
        <span><b className="tnum">{duration(run.duration)}</b></span>
        <span><b className="tnum">{pace(run.distance / run.duration)}</b> /km</span>
      </div>
      <RunChart x={view.x} total={view.total} lines={lines} focus={focus} onFocus={setFocus} domain={domain}
        onDomain={(d) => setZoom(d[0] <= 0 && d[1] >= view.total ? null : d)} laps={view.laps} cursor={cursor} onCursor={setCursor}
        selection={null} onSelect={(b) => setZoom(clampDomain([b.from, b.to], view.total))} head={head} height={Math.max(150, lines.length * 55)} />
      <Link className="row-open" href={`/run?id=${run.id}`}>Open the run →</Link>
    </div>
  );
}
