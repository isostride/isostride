'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Expandable, ReadError, useDataVersion } from '@/components';
import { runInWorker, useLocale, useOpenFolder } from '@/lib/client';
import { PATHS, readJson } from '@/lib/fs';
import { t } from '@/lib/i18n';
import type { RunsIndex } from '@/lib/kernel';
import { formSeries, onLoad, performanceReport, summariesCurrent, type LoadSummary, type ModelKey, type ModelReport } from '@/lib/load';
import { CURVE_MODELS, LOAD_MODELS, readSettings, type SettingsFile } from '@/lib/settings';
import { PinButton } from '../dashboard/PinButton';
import { WhyBar } from './Assumptions';
import { EfficiencyTab } from './EfficiencyTab';
import { EffortsTab } from './EffortsTab';
import { FittedTab } from './FittedTab';
import { FormTab } from './FormTab';
import { IntensityTab } from './IntensityTab';
import { LoadTab } from './LoadTab';
import { CriticalTab, PredictionsTab } from './MarkersTab';
import { OverviewTab } from './OverviewTab';
import { TABS, type Tab } from './structure';
import { Vo2Tab } from './Vo2Tab';
import { CurveWhatIfView, LoadWhatIfView } from './WhatIfTab';

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface Data {
  runs: RunsIndex['runs'];
  summaries: Record<string, LoadSummary>;
  settings: SettingsFile;
}

/**
 * The content of the Performance screen (and of a view pinned to the Dashboard, embedded there) (loaded after the page's frame, ADR "Built with React":
 * 200 KB of script per route): the runs' summaries read once, the models' report computed from
 * them, and for each view its models' trust with a "Why?", then its data.
 */
export function Body({ tab: asked, view, embedded = false }: { tab: Tab; view: string; /** on the Dashboard: the view's charts alone */ embedded?: boolean }) {
  // A tab the app no longer has (a tile pinned by an older version, a link edited by hand) threw as it was drawn, and the whole Dashboard with it: the overview.
  const tab: Tab = TABS.some((tb) => tb.key === asked) ? asked : 'overview';
  const { folder, handle } = useOpenFolder();
  const [data, setData] = useState<Data | null>(null);
  const [preparing, setPreparing] = useState(false);
  /** the folder could not be read; `again` counts the tries */
  const [failed, setFailed] = useState(false);
  const [again, setAgain] = useState(0);
  /** raised when an import or a recompute ends, wherever it was started */
  const dataVersion = useDataVersion();
  // Its charts and texts follow a change of the language (on the Dashboard too): the report's texts are built in it.
  const locale = useLocale();

  useEffect(() => {
    let live = true;
    (async () => {
      const read = () => readJson<{ version?: number; algorithmVersion?: number; runs: Record<string, LoadSummary> }>(folder, PATHS.loadSummaries);
      let file = await read();
      const index = await readJson<RunsIndex>(folder, PATHS.runsIndex);
      // Summaries of an earlier version are built again once, in the Processing Worker.
      if (index?.runs.length && !summariesCurrent(file)) {
        if (live) setPreparing(true);
        await runInWorker('context', handle);
        file = await read();
      }
      const [settings, fresh] = await Promise.all([readSettings(folder), readJson<RunsIndex>(folder, PATHS.runsIndex)]);
      if (live) { setData({ runs: fresh?.runs ?? [], summaries: file?.runs ?? {}, settings }); setPreparing(false); }
    })().catch(() => { if (live) { setPreparing(false); setFailed(true); } });
    return () => { live = false; };
  }, [folder, handle, dataVersion, again]);

  const today = localDay(new Date());
  const days = useMemo(() => (data ? formSeries(data.runs.filter((r) => typeof r.load === 'number').map((r) => ({ startTime: r.startTime, load: r.load as number })), data.settings.performance, today) : []), [data, today]);
  const report = useMemo(() => (data ? performanceReport({
    rows: data.runs, summaries: data.summaries, performance: data.settings.performance,
    hrZones: data.settings.zones.heartRate ?? [], zonesOwn: !data.settings.defaults, days, today,
  }) : null), [data, days, today, locale]);
  const by = useMemo(() => (report ? Object.fromEntries(report.models.map((m) => [m.key, m])) as Record<ModelKey, ModelReport> : null), [report]);

  if (failed && !data) return <ReadError onRetry={() => { setFailed(false); setAgain((n) => n + 1); }} />;
  if (!data || !report || !by) {
    return <div className="card chart muted small" style={{ padding: 18 }} role="status">{preparing ? t('Preparing the summaries of your runs, once…') : t('Reading the runs…')}</div>;
  }
  const curveName = t(CURVE_MODELS.find((m) => m.key === data.settings.performance.curve)!.name);
  // What the load model chosen changes, marked so wherever it shows.
  const loadName = LOAD_MODELS.find((m) => m.key === data.settings.performance.load)?.name;
  const byLoad = { set: onLoad(report.models), name: loadName ? t(loadName) : t('the load model'), unit: report.now.loadUnit };
  if (tab === 'overview') return <OverviewTab models={report.models} by={by} now={report.now} byLoad={byLoad} />;

  const views = TABS.find((tb) => tb.key === tab)!.views;
  const shown = views.find((v) => v.key === view) ?? views[0];
  const { runs, summaries, settings } = data;
  const hrZones = settings.zones.heartRate ?? [];
  const unit = LOAD_MODELS.find((m) => m.key === settings.performance.load)?.unit ?? '';
  const content = (() => {
    switch (`${tab}/${shown.key}`) {
      case 'load/form': return <FormTab runs={runs} />;
      case 'load/weekly': return <LoadTab days={days} unit={unit} />;
      case 'load/intensity': return <IntensityTab runs={runs} summaries={summaries} hrZones={hrZones} maxHr={report.now.maxHr} today={today} />;
      case 'capacity/efforts': return <EffortsTab now={report.now} runs={runs} model={settings.performance.curve} />;
      case 'capacity/critical': return <CriticalTab runs={runs} summaries={summaries} today={today} />;
      case 'capacity/predictions': return <PredictionsTab runs={runs} summaries={summaries} today={today} model={settings.performance.curve} />;
      case 'aerobic/efficiency': return <EfficiencyTab part="ef" runs={runs} summaries={summaries} maxHr={report.now.maxHr} today={today} />;
      case 'aerobic/decoupling': return <EfficiencyTab part="decoupling" runs={runs} summaries={summaries} maxHr={report.now.maxHr} today={today} />;
      case 'aerobic/vo2': return <Vo2Tab runs={runs} summaries={summaries} performance={settings.performance} today={today} />;
      case 'whatif/curve': return <CurveWhatIfView now={report.now} runs={runs} summaries={summaries} model={settings.performance.curve} />;
      case 'whatif/load': return <LoadWhatIfView runs={runs} summaries={summaries} performance={settings.performance} unit={unit} today={today} />;
      case 'response/hr': return <FittedTab criterion="hr" runs={runs} summaries={summaries} performance={settings.performance} days={days} today={today} />;
      default: return <FittedTab criterion="vdot" runs={runs} summaries={summaries} performance={settings.performance} days={days} today={today} />;
    }
  })();
  if (embedded) return content;
  // The view is a widget: Pin in its corner puts it on the Dashboard as it is here. Its name is written
  // to the data folder, so it stays the English one (the keys), whatever the language in use.
  return (
    <>
      {(['capacity/efforts', 'capacity/predictions', 'whatif/curve'].includes(`${tab}/${shown.key}`)) && (
        <p className="load-using muted small" role="note" aria-label={t('Curve model in use')}>
          {t('The curve of your bests and the predicted times come from')} <span className="by-load">{curveName}</span>. <Link href="/settings?tab=models">{t('Change it in Settings →')}</Link>
        </p>
      )}
      {(tab === 'load' || tab === 'response' || `${tab}/${shown.key}` === 'whatif/load') && (
        <p className="load-using muted small" role="note" aria-label={t('Load model in use')}>
          {t('The load of a run is counted as')} <span className="by-load">{byLoad.name}</span>{t(': what is marked by it follows that choice; Capacity and Aerobic do not depend on it.')} <Link href="/settings?tab=models">{t('Change it in Settings →')}</Link>
        </p>
      )}
      <WhyBar key={`${tab}/${shown.key}`} models={shown.models} by={by} byLoad={byLoad} />
      <Expandable className="pin-host perf-widget" title={`${t(TABS.find((tb) => tb.key === tab)!.name)} · ${t(shown.name)}`}>
        {/* A scenario lives in the link, so it is no widget of the Dashboard. */}
        {tab !== 'whatif' && <PinButton folder={folder} kind="perf" target={`${tab}/${shown.key}`} name={`${TABS.find((tb) => tb.key === tab)!.name} · ${shown.name}`} />}
        {content}
      </Expandable>
    </>
  );
}
