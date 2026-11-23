'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { PATHS, readJson, type DataFolder } from '@/lib/fs';
import type { RunsIndex } from '@/lib/kernel';
import { formSeries, performanceReport, todoList, type LoadSummary, type ModelKey } from '@/lib/load';
import { readSettings, type SettingsFile } from '@/lib/settings';
import { TrustChip } from '../performance/Assumptions';
import { saysNow } from '../performance/OverviewTab';
import { performanceHref } from '../performance/structure';

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * The tiles of the Dashboard that rest on the models of Performance: a model's value now with its
 * trust, and what to do so the models work. The models' report is computed as Performance computes
 * it, once for every such tile (loaded only when the Dashboard has one).
 */
export function ModelTiles({ folder, models, todo, render }: {
  folder: DataFolder;
  /** the models whose tiles are shown */
  models: ModelKey[];
  /** whether the To do tile is shown */
  todo: boolean;
  /** places each tile's body in its frame, by the tile's id */
  render: (id: string, title: string, body: React.ReactNode) => React.ReactNode;
}) {
  const [data, setData] = useState<{ runs: RunsIndex['runs']; summaries: Record<string, LoadSummary>; settings: SettingsFile } | null>(null);
  useEffect(() => {
    Promise.all([readJson<RunsIndex>(folder, PATHS.runsIndex), readJson<{ runs: Record<string, LoadSummary> }>(folder, PATHS.loadSummaries), readSettings(folder)])
      .then(([index, sums, settings]) => setData({ runs: index?.runs ?? [], summaries: sums?.runs ?? {}, settings }))
      .catch(() => undefined);
  }, [folder]);
  const report = useMemo(() => {
    if (!data) return null;
    const today = localDay(new Date());
    const days = formSeries(data.runs.filter((r) => typeof r.load === 'number').map((r) => ({ startTime: r.startTime, load: r.load as number })), data.settings.performance, today);
    return performanceReport({ rows: data.runs, summaries: data.summaries, performance: data.settings.performance, hrZones: data.settings.zones.heartRate ?? [], zonesOwn: !data.settings.defaults, days, today });
  }, [data]);

  return (
    <>
      {models.map((key) => {
        const m = report?.models.find((x) => x.key === key);
        return render(`model:${key}`, m?.name ?? 'Model', !report ? <p className="muted small">Reading the runs…</p> : !m ? <p className="muted small">This model is not there any more.</p> : (
          <div className="dash-model">
            <div className="dash-big tnum">{saysNow(m.key, report.now)}</div>
            <TrustChip trust={m.trust} />
            <Link className="row-open" href={performanceHref(m.where.tab, m.where.view)}>Performance →</Link>
          </div>
        ));
      })}
      {todo && render('todo', 'To do for the models', !report ? <p className="muted small">Reading the runs…</p> : (() => {
        const open = todoList(report.models).filter((t) => !t.done).slice(0, 3);
        return open.length ? (
          <ol className="dash-todo">
            {open.map((t) => <li key={t.key}><b>{t.title}</b><span className="muted small">{t.how}</span></li>)}
            <li className="dash-more"><Link className="row-open" href="/performance?tab=todo">All of it →</Link></li>
          </ol>
        ) : <p className="muted small">Nothing to do: every check the runner can act on holds.</p>;
      })())}
    </>
  );
}
