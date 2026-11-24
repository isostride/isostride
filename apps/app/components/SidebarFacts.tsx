'use client';

import { useEffect } from 'react';
import { RECOMMENDATIONS_PATH, type BlockDefinitionsFile } from '@/lib/blocks';
import type { SavedAnalysesFile } from '@/lib/compare';
import { PATHS, readJson, type DataFolder } from '@/lib/fs';
import type { RunsIndex } from '@/lib/kernel';
import { useLocale } from '@/lib/client';
import { dateText, number, t, tn } from '@/lib/i18n';
import { formSeries } from '@/lib/load';
import { readSettings } from '@/lib/settings';
import { useDataVersion } from './dataVersion';

const short = (iso: string) => dateText(iso, { day: 'numeric', month: 'short' });

/**
 * What fills the side menu (the runner's request of 22 Nov 2026: "menu ... chce je wizualnie
 * rozszerzyc ... bo pusto w menu jest"; requirement "Side menu with the data"): a line of facts
 * under each screen, handed to the menu (this week's running under them taken out: "w miedzyczasie
 * usun"). Read from the data folder's files when the data or the screen change; loaded after the
 * screen, so no screen's script grows. It draws nothing itself.
 */
export function SidebarFacts({ folder, path, onFacts }: { folder: DataFolder; path: string; onFacts: (facts: Record<string, string>) => void }) {
  const version = useDataVersion();
  // The facts are written in the language in use, again when it changes.
  const lang = useLocale();
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
        '/dashboard': t('What matters to you'),
        '/': runs.length ? t('{runs} · last {date}', { runs: tn(runs.length, '{n} run', '{n} runs'), date: short(last!.startTime) }) : t('No run yet'),
        '/segments': `${tn(kept, '{n} kept', '{n} kept')}${suggested ? ` · ${tn(suggested, '{n} suggested', '{n} suggested')}` : ''}`,
        '/compare': analyses ? tn(analyses, '{n} saved analysis', '{n} saved analyses') : t('Trends, efforts, A/B'),
        '/performance': form === null ? t('Load, capacity, models') : t('Form {form} today', { form: `${form >= 0 ? '+' : '−'}${number(Math.abs(Math.round(form)))}` }),
        '/settings': t('Zones, gear, models'),
      });
    })().catch(() => undefined);
    return () => { live = false; };
    // The facts follow the data and the screen (a segment saved, an analysis kept).
  }, [folder, version, path, onFacts, lang]);

  return null;
}
