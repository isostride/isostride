'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useDataVersion } from '@/components';
import { useLocale } from '@/lib/client';
import { PATHS, readJson, type DataFolder } from '@/lib/fs';
import { t } from '@/lib/i18n';
import type { RunsIndex } from '@/lib/kernel';
import { formSeries, performanceReport, type LoadSummary, type ModelKey } from '@/lib/load';
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
export function ModelTiles({ folder, models, render }: {
  folder: DataFolder;
  /** the models whose tiles are shown */
  models: ModelKey[];
  /** places each tile's body in its frame, by the tile's id */
  render: (id: string, title: string, body: React.ReactNode) => React.ReactNode;
}) {
  const [data, setData] = useState<{ runs: RunsIndex['runs']; summaries: Record<string, LoadSummary>; settings: SettingsFile } | null>(null);
  const dataVersion = useDataVersion();
  useEffect(() => {
    Promise.all([readJson<RunsIndex>(folder, PATHS.runsIndex), readJson<{ runs: Record<string, LoadSummary> }>(folder, PATHS.loadSummaries), readSettings(folder)])
      .then(([index, sums, settings]) => setData({ runs: index?.runs ?? [], summaries: sums?.runs ?? {}, settings }))
      .catch(() => undefined);
    // Again after an import or a recompute, as the tiles beside them (the model tiles kept what they first read).
  }, [folder, dataVersion]);
  const locale = useLocale();
  const report = useMemo(() => {
    if (!data) return null;
    const today = localDay(new Date());
    const days = formSeries(data.runs.filter((r) => typeof r.load === 'number').map((r) => ({ startTime: r.startTime, load: r.load as number })), data.settings.performance, today);
    return performanceReport({ rows: data.runs, summaries: data.summaries, performance: data.settings.performance, hrZones: data.settings.zones.heartRate ?? [], zonesOwn: !data.settings.defaults, days, today });
    // locale: the report's texts are built in the language in use.
  }, [data, locale]);

  return (
    <>
      {models.map((key) => {
        const m = report?.models.find((x) => x.key === key);
        return render(`model:${key}`, m ? t(m.name) : t('Model'), !report ? <p className="muted small">{t('Reading the runs…')}</p> : !m ? <p className="muted small">{t('This model is not there any more.')}</p> : (
          <div className="dash-model">
            <div className="dash-big tnum">{saysNow(m.key, report.now)}</div>
            <TrustChip trust={m.trust} />
            <Link className="row-open" href={performanceHref(m.where.tab, m.where.view)}>{t('Performance →')}</Link>
          </div>
        ));
      })}
    </>
  );
}
