'use client';

import { eager, useTabInView } from '@/components';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useLocale } from '@/lib/client';
import { t } from '@/lib/i18n';
import { TABS, performanceHref, type Tab } from './structure';

// The content loads after the frame of the page (ADR "Built with React": 200 KB of script per route).
const Body = eager(() => import('./Body').then((m) => m.Body), () => <div className="card chart muted small" style={{ padding: 18 }}>{t('Loading…')}</div>);

export default function PerformancePageWrapper() {
  return <Suspense fallback={<div className="page"><div className="page-head"><h1>{t('Performance')}</h1></div></div>}><PerformancePage /></Suspense>;
}

/**
 * Performance (the author's requests of 21 Nov 2026: "form na zewnatrz analytics", then "chce tam
 * dane w bardziej ustrukturyzowany sposob ... chce wiedziec jakie sa zalezenia"): the models grouped
 * by the evidence they rest on — an overview, a tab per group with its views, and the settings —
 * the tab and the view kept in the link (tab=…, view=…).
 */
function PerformancePage() {
  const params = useSearchParams();
  const router = useRouter();
  // The tabs, views and charts follow a change of the language.
  useLocale();
  // The Model tab of before: its choice is at the top of Load now.
  const tabParam = params.get('tab') === 'model' ? 'load' : params.get('tab');
  const tab: Tab = TABS.some((tb) => tb.key === tabParam) ? (tabParam as Tab) : 'overview';
  const tabsRow = useTabInView(tab);
  const def = TABS.find((tb) => tb.key === tab)!;
  const view = def.views.find((v) => v.key === params.get('view'))?.key ?? def.views[0]?.key ?? '';
  return (
    <div className="page wide-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">{t('What your runs say about you, and what each number rests on')}</div>
          <h1>{t('Performance')}</h1>
        </div>
      </div>
      <div ref={tabsRow} className="tabs page-tabs" role="tablist" aria-label={t('Performance sections')}>
        {TABS.map((tb) => (
          <button key={tb.key} type="button" role="tab" id={`tab-${tb.key}`} aria-controls={tab === tb.key ? `panel-${tb.key}` : undefined} aria-selected={tab === tb.key} className={tab === tb.key ? 'on' : ''} onClick={() => router.replace(performanceHref(tb.key))}>{t(tb.name)}</button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {/* A group's views are a second level, not a second row of tabs ("w performance w roznych zakladkach
            mam 2 poziomy tabow", answered "Views inside the card"): the group's card, a small switch of its
            views at the left of its head ("chce to po lewej stronie"), its name not said again under the
            tab that says it ("powtarzasz tytul"), the view under them. */}
        {def.views.length > 0 ? (
          <section className="perf-views-card" aria-label={t(def.name)}>
            <header className="perf-views-head">
              <div className="segmented perf-views" role="radiogroup" aria-label={t('{name} views', { name: t(def.name) })}>
                {def.views.map((v) => <button key={v.key} type="button" role="radio" aria-checked={view === v.key} className={view === v.key ? 'on' : ''} onClick={() => router.replace(performanceHref(tab, v.key))}>{t(v.name)}</button>)}
              </div>
            </header>
            <Body tab={tab} view={view} />
          </section>
        ) : <Body tab={tab} view={view} />}
      </div>
    </div>
  );
}
