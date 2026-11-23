'use client';

import { useEffect, useState } from 'react';
import { RECOMMENDATIONS_PATH, type BlockDefinitionsFile } from '@/lib/blocks';
import type { SavedAnalysesFile } from '@/lib/compare';
import { PATHS, readJson, type DataFolder } from '@/lib/fs';
import type { RunsIndex } from '@/lib/kernel';
import { formSeries } from '@/lib/load';
import { readSettings } from '@/lib/settings';
import { useDataVersion } from './dataVersion';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const short = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const hm = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
/** The local Monday of a day, as YYYY-MM-DD. */
function mondayOf(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

interface Week { km: number; runs: number; time: number; byDay: number[]; last: { start: string; km: number } | null }

/**
 * What fills the side menu (the runner's request of 22 Nov 2026: "menu ... chce je wizualnie
 * rozszerzyc ... bo pusto w menu jest"; requirement "Side menu with the data"): a line of facts
 * under each screen, handed to the menu, and this week's running under it: kilometres, runs and
 * time with a bar for each day, and the last run. Read from the data folder's files when the data
 * or the screen change; loaded after the screen, so no screen's script grows.
 */
export function SidebarFacts({ folder, path, onFacts }: { folder: DataFolder; path: string; onFacts: (facts: Record<string, string>) => void }) {
  const version = useDataVersion();
  const [week, setWeek] = useState<Week | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const [index, defs, recs, saved, settings] = await Promise.all([
        readJson<RunsIndex>(folder, PATHS.runsIndex),
        readJson<BlockDefinitionsFile>(folder, PATHS.blockDefinitions),
        readJson<{ recommendations: unknown[] }>(folder, RECOMMENDATIONS_PATH),
        readJson<SavedAnalysesFile>(folder, PATHS.analyses),
        readSettings(folder),
      ]);
      if (!live) return;
      const runs = [...(index?.runs ?? [])].sort((a, b) => a.startTime.localeCompare(b.startTime));
      const last = runs[runs.length - 1] ?? null;
      const kept = (defs?.definitions ?? []).filter((d) => d.status === 'active').length;
      const suggested = recs?.recommendations.length ?? 0;
      const analyses = saved?.analyses.length ?? 0;
      // The form today, as the Dashboard and Performance compute it.
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const days = formSeries(runs.filter((r) => typeof r.load === 'number').map((r) => ({ startTime: r.startTime, load: r.load as number })), settings.performance, today);
      const form = days.length ? days[days.length - 1].form : null;
      onFacts({
        '/dashboard': 'What matters to you',
        '/': runs.length ? `${runs.length} runs · last ${short(last!.startTime)}` : 'No run yet',
        '/segments': `${kept} kept${suggested ? ` · ${suggested} suggested` : ''}`,
        '/compare': analyses ? `${analyses} saved ${analyses === 1 ? 'analysis' : 'analyses'}` : 'Trends, efforts, A/B',
        '/performance': form === null ? 'Load, capacity, models' : `Form ${form >= 0 ? '+' : '−'}${Math.abs(Math.round(form))} today`,
        '/settings': 'Zones, gear, models',
      });
      // This week, Monday to Sunday.
      const monday = mondayOf(new Date());
      const byDay = new Array(7).fill(0);
      let km = 0, n = 0, time = 0;
      for (const r of runs) {
        const t = new Date(r.startTime);
        const k = Math.floor((mondayOf(t).getTime() === monday.getTime() ? (t.getDay() + 6) % 7 : -1));
        if (k < 0) continue;
        byDay[k] += r.distance / 1000; km += r.distance / 1000; n++; time += r.duration;
      }
      setWeek({ km, runs: n, time, byDay, last: last ? { start: last.startTime, km: last.distance / 1000 } : null });
    })().catch(() => undefined);
    return () => { live = false; };
    // The facts follow the data and the screen (a segment saved, an analysis kept).
  }, [folder, version, path, onFacts]);

  if (!week) return null;
  const top = Math.max(...week.byDay, 1);
  const today = (new Date().getDay() + 6) % 7;
  return (
    <section className="side-week label" aria-label="This week">
      <div className="side-week-head"><b>This week</b><span>{week.runs} run{week.runs === 1 ? '' : 's'}</span></div>
      <div className="side-week-figures">
        <span><b className="tnum">{week.km.toFixed(1)}</b> km</span>
        <span><b className="tnum">{hm(week.time)}</b> h</span>
      </div>
      <div className="side-week-bars" role="img" aria-label={`Kilometres by day: ${week.byDay.map((v, i) => `${DAYS[i]} ${v.toFixed(1)}`).join(', ')}`}>
        {week.byDay.map((v, i) => (
          <span key={i} className={i === today ? 'today' : ''}>
            <i style={{ height: `${v ? Math.max(8, (v / top) * 100) : 0}%` }} />
            <small>{DAYS[i]}</small>
          </span>
        ))}
      </div>
      {week.last && <div className="side-week-last">Last run · {short(week.last.start)} · {week.last.km.toFixed(1)} km</div>}
    </section>
  );
}
