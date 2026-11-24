'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { RunChart, clampDomain, clock, rollingMean, smoothSpan, type Domain, type RunLine } from '@/components';
import { PATHS, readJson, type DataFolder, readRunFile } from '@/lib/fs';
import { duration, km, pace } from '@/lib/format';
import { t } from '@/lib/i18n';
import type { RunFile } from '@/lib/kernel';
import { runMetric, secondsOf, type WindowKey } from './metrics';

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
    // Second by second, as the Run screen draws it.
    const { x, series } = secondsOf(run);
    const total = x.length ? x[x.length - 1] : 1;
    return { x, total, series, laps: run.laps.map((l, i) => ({ from: l.start, to: l.end, label: t('Lap {n} · {km} km', { n: i + 1, km: km(l.distance) }), short: t('Lap {n}', { n: i + 1 }) })) };
  }, [run]);

  if (run === undefined) return <p className="muted small" role="status">{t('Reading the run…')}</p>;
  if (!run || !view) return <p className="muted small">{t('This run is not there any more.')}</p>;
  const keys = (metrics ? metrics.split(',') : DEFAULT).filter((k): k is WindowKey => !!view.series[k]);
  const domain: Domain = zoom ?? [0, view.total];
  const span = smoothSpan(domain[1] - domain[0]);
  const lines: RunLine[] = keys.flatMap((k, i) => {
    const m = runMetric(k, run.metrics);
    return view.series[k].some((v) => v !== null) ? [{ key: m.key, title: m.title, short: m.short, unit: m.unit, y: rollingMean(view.x, view.series[k], span), color: `var(--series-${i + 1})`, format: m.format, tick: m.tick, minSpan: m.minSpan, invert: m.invert, steps: m.steps }] : [];
  });
  const head = (at: number) => {
    const i = run.samples.t.findIndex((s) => s >= at);
    return `${clock(at)}${i >= 0 && run.samples.distance[i] !== null ? ` · ${km(run.samples.distance[i]!)} km` : ''}`;
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
      <Link className="row-open" href={`/run?id=${run.id}`}>{t('Open the run →')}</Link>
    </div>
  );
}
