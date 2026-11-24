'use client';

import { useEffect, useMemo, useState } from 'react';
import { useOpenFolder } from '@/lib/client';
import { PATHS, readJson } from '@/lib/fs';
import { CONTEXT_METRICS, KNOWN_METRICS, directionOf, metricInfo, type Direction, type MetricInfo, type MetricsFile } from '@/lib/kernel';
import { number, t } from '@/lib/i18n';
import { readSettings } from '@/lib/settings';
import { useDataVersion } from './dataVersion';

const mmss = (v: number) => {
  const s = Math.round(v);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
/** A tick: whole numbers unless the step of the axis needs decimals. */
const num = (min: number) => (v: number, d = 0) => number(v, Math.max(min, d));
/** Round steps of a pace axis, s/km: 0:05 up to 5:00. */
export const PACE_STEPS = [5, 10, 15, 30, 60, 120, 300];

/**
 * How the screens show a metric (ADR "Metrics from the file"): a short button name, its name with
 * its unit, a value, an axis tick (with the decimals its step needs), the least range its axis shows
 * (a difference smaller than about a quarter of it is small on the chart too), and which way is better.
 */
export interface MetricView {
  key: string;
  short: string;
  /** the name alone, e.g. "Ground contact time" */
  title: string;
  /** the name with its unit, e.g. "Ground contact time (ms)" */
  name: string;
  unit: string;
  fmt: (v: number) => string;
  tick: (v: number, decimals?: number) => string;
  minSpan: number;
  /** a pace: drawn with the faster (lower s/km) values higher */
  invert?: boolean;
  /** round steps of its axis */
  steps?: number[];
  /** which way is better: the app's own, or as the runner set it in Settings */
  direction: Direction;
}

/** The view of a metric from the folder's catalog and the directions the runner set. */
export function metricView(key: string, catalog?: readonly MetricInfo[] | null, directions?: Record<string, Direction> | null): MetricView {
  const info = metricInfo(key, catalog);
  // The names of the metrics the app knows in the language in use; a file's own names as the file gives them.
  const m = { ...info, name: t(info.name), short: t(info.short), unit: info.unit ? t(info.unit) : info.unit };
  const direction = directionOf(m, directions);
  if (m.display === 'pace') return { key, short: m.short, title: m.name, name: `${m.name} (min/km)`, unit: 'min/km', fmt: (v) => `${mmss(v)} /km`, tick: mmss, minSpan: m.minSpan, invert: true, steps: PACE_STEPS, direction };
  const unit = m.unit ? ` ${m.unit}` : '';
  return { key, short: m.short, title: m.name, name: m.unit ? `${m.name} (${m.unit})` : m.name, unit: m.unit, fmt: (v) => `${number(v, m.decimals)}${unit}`, tick: num(m.decimals), minSpan: m.minSpan || 0, direction };
}

/** The known metrics compared on blocks, in the order of the pickers; a folder's others follow by name. */
const BLOCK_ORDER = ['speed', 'heartRate', 'cadence', 'groundContactTime', 'verticalOscillation', 'stepLength', 'power', 'efficiency', 'legSpringStiffness', 'effortPace'];

/** The metrics of blocks the catalog holds (all but the ground's and the day's), the known ones first. */
export function blockKeysOf(catalog: readonly MetricInfo[]): string[] {
  const keys = catalog.map((m) => m.key).filter((k) => !CONTEXT_METRICS.includes(k));
  const known = BLOCK_ORDER.filter((k) => keys.includes(k));
  return [...known, ...keys.filter((k) => !known.includes(k)).sort((a, b) => metricInfo(a, catalog).name.localeCompare(metricInfo(b, catalog).name))];
}

/** The known metrics' views, for a folder that holds no catalog yet (its data from before schema 2). */
export const METRIC_VIEW: MetricView[] = BLOCK_ORDER.map((k) => metricView(k));

/** Raised when the runner saves the metrics' directions in Settings: the screens read them again. */
export const METRICS_CHANGED = 'isostride:metrics';

export interface Metrics {
  catalog: MetricInfo[];
  directions: Record<string, Direction>;
  view: (key: string) => MetricView;
  /** the metrics of blocks the folder holds, in the order of the pickers */
  blockKeys: string[];
  /** the folder's catalog is read (until then the known metrics stand in) */
  ready: boolean;
}

/**
 * The folder's metrics (derived/metrics.json) and the directions the runner set (requirements
 * "Every metric offered everywhere", "Metric direction set by the runner"); read again after an
 * import or a recompute and when the directions change. A folder without the catalog (imported
 * before it) gets the known metrics.
 */
export function useMetrics(): Metrics {
  const { folder } = useOpenFolder();
  const version = useDataVersion();
  // Until the folder's catalog is read, the known metrics: no screen starts with none.
  const [state, setState] = useState<{ catalog: MetricInfo[]; directions: Record<string, Direction>; ready: boolean }>(() => ({ catalog: BLOCK_ORDER.map((k) => KNOWN_METRICS[k]), directions: {}, ready: false }));
  const [changed, setChanged] = useState(0);
  useEffect(() => {
    const on = () => setChanged((c) => c + 1);
    window.addEventListener(METRICS_CHANGED, on);
    return () => window.removeEventListener(METRICS_CHANGED, on);
  }, []);
  useEffect(() => {
    let live = true;
    Promise.all([readJson<MetricsFile>(folder, PATHS.metrics), readSettings(folder)]).then(([file, settings]) => {
      if (!live) return;
      const catalog = file?.metrics?.length ? file.metrics : BLOCK_ORDER.map((k) => KNOWN_METRICS[k]);
      setState({ catalog, directions: settings.directions ?? {}, ready: true });
    }).catch(() => undefined);
    return () => { live = false; };
  }, [folder, version, changed]);
  return useMemo(() => ({
    catalog: state.catalog,
    directions: state.directions,
    view: (key: string) => metricView(key, state.catalog, state.directions),
    blockKeys: blockKeysOf(state.catalog),
    ready: state.ready,
  }), [state]);
}
