'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDataVersion } from '@/components';
import { runInWorker, useOpenFolder } from '@/lib/client';
import { PATHS, readJson } from '@/lib/fs';
import type { RunsIndex } from '@/lib/kernel';
import { LOAD_SUMMARY_VERSION, formSeries, performanceReport, type LoadSummary, type ModelKey, type ModelReport } from '@/lib/load';
import { LOAD_MODELS, readSettings, type SettingsFile } from '@/lib/settings';
import { WhyBar } from './Assumptions';
import { EfficiencyTab } from './EfficiencyTab';
import { EffortsTab } from './EffortsTab';
import { FittedTab } from './FittedTab';
import { FormTab } from './FormTab';
import { IntensityTab } from './IntensityTab';
import { LoadTab } from './LoadTab';
import { CriticalTab, PredictionsTab } from './MarkersTab';
import { OverviewTab } from './OverviewTab';
import { TodoTab } from './TodoTab';
import { PerformanceCard } from './PerformanceCard';
import { TABS, type Tab } from './structure';
import { Vo2Tab } from './Vo2Tab';

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface Data {
  runs: RunsIndex['runs'];
  summaries: Record<string, LoadSummary>;
  settings: SettingsFile;
}

/**
 * The content of the Performance screen (loaded after the page's frame, ADR "Built with React":
 * 200 KB of script per route): the runs' summaries read once, the models' report computed from
 * them, and for each view its models' trust with a "Why?", then its data.
 */
export function Body({ tab, view }: { tab: Tab; view: string }) {
  const { folder, handle } = useOpenFolder();
  const [data, setData] = useState<Data | null>(null);
  const [preparing, setPreparing] = useState(false);
  /** raised when the model is saved: the loads were recomputed */
  const [version, setVersion] = useState(0);
  /** raised when an import or a recompute ends, wherever it was started */
  const dataVersion = useDataVersion();

  useEffect(() => {
    let live = true;
    (async () => {
      const read = () => readJson<{ version?: number; runs: Record<string, LoadSummary> }>(folder, PATHS.loadSummaries);
      let file = await read();
      const index = await readJson<RunsIndex>(folder, PATHS.runsIndex);
      // Summaries of an earlier version are built again once, in the Processing Worker.
      if (index?.runs.length && file?.version !== LOAD_SUMMARY_VERSION) {
        if (live) setPreparing(true);
        await runInWorker('context', handle);
        file = await read();
      }
      const [settings, fresh] = await Promise.all([readSettings(folder), readJson<RunsIndex>(folder, PATHS.runsIndex)]);
      if (live) { setData({ runs: fresh?.runs ?? [], summaries: file?.runs ?? {}, settings }); setPreparing(false); }
    })().catch(() => live && setPreparing(false));
    return () => { live = false; };
  }, [folder, handle, version, dataVersion]);

  const today = localDay(new Date());
  const days = useMemo(() => (data ? formSeries(data.runs.filter((r) => typeof r.load === 'number').map((r) => ({ startTime: r.startTime, load: r.load as number })), data.settings.performance, today) : []), [data, today]);
  const report = useMemo(() => (data ? performanceReport({
    rows: data.runs, summaries: data.summaries, performance: data.settings.performance,
    hrZones: data.settings.zones.heartRate ?? [], zonesOwn: !data.settings.defaults, days, today,
  }) : null), [data, days, today]);
  const by = useMemo(() => (report ? Object.fromEntries(report.models.map((m) => [m.key, m])) as Record<ModelKey, ModelReport> : null), [report]);

  if (!data || !report || !by) {
    return <div className="card chart muted small" style={{ padding: 18 }} role="status">{preparing ? 'Preparing the summaries of your runs, once…' : 'Reading the runs…'}</div>;
  }
  if (tab === 'overview') return <OverviewTab models={report.models} by={by} now={report.now} />;
  if (tab === 'todo') return <TodoTab models={report.models} by={by} />;
  if (tab === 'model') {
    return (
      <>
        <WhyBar models={['load']} by={by} />
        <PerformanceCard onSaved={() => setVersion((v) => v + 1)} />
      </>
    );
  }

  const views = TABS.find((t) => t.key === tab)!.views;
  const shown = views.find((v) => v.key === view) ?? views[0];
  const { runs, summaries, settings } = data;
  const hrZones = settings.zones.heartRate ?? [];
  const unit = LOAD_MODELS.find((m) => m.key === settings.performance.load)?.unit ?? '';
  const content = (() => {
    switch (`${tab}/${shown.key}`) {
      case 'load/form': return <FormTab runs={runs} />;
      case 'load/weekly': return <LoadTab days={days} unit={unit} />;
      case 'load/intensity': return <IntensityTab runs={runs} summaries={summaries} hrZones={hrZones} />;
      case 'capacity/efforts': return <EffortsTab now={report.now} runs={runs} />;
      case 'capacity/critical': return <CriticalTab runs={runs} summaries={summaries} today={today} />;
      case 'capacity/predictions': return <PredictionsTab runs={runs} summaries={summaries} today={today} />;
      case 'aerobic/efficiency': return <EfficiencyTab part="ef" runs={runs} summaries={summaries} hrZones={hrZones} />;
      case 'aerobic/decoupling': return <EfficiencyTab part="decoupling" runs={runs} summaries={summaries} hrZones={hrZones} />;
      case 'aerobic/vo2': return <Vo2Tab runs={runs} summaries={summaries} performance={settings.performance} />;
      case 'response/hr': return <FittedTab criterion="hr" runs={runs} summaries={summaries} performance={settings.performance} days={days} today={today} />;
      default: return <FittedTab criterion="vdot" runs={runs} summaries={summaries} performance={settings.performance} days={days} today={today} />;
    }
  })();
  return (
    <>
      <WhyBar key={`${tab}/${shown.key}`} models={shown.models} by={by} />
      {content}
    </>
  );
}
