'use client';

import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { TABS, performanceHref, type Tab } from './structure';

// The content loads after the frame of the page (ADR "Built with React": 200 KB of script per route).
const Body = dynamic(() => import('./Body').then((m) => m.Body), { ssr: false, loading: () => <div className="card chart muted small" style={{ padding: 18 }}>Loading…</div> });

export default function PerformancePageWrapper() {
  return <Suspense fallback={<div className="page"><div className="page-head"><h1>Performance</h1></div></div>}><PerformancePage /></Suspense>;
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
  // The Model tab of before: its choice is at the top of Load now.
  const tabParam = params.get('tab') === 'model' ? 'load' : params.get('tab');
  const tab: Tab = TABS.some((t) => t.key === tabParam) ? (tabParam as Tab) : 'overview';
  const def = TABS.find((t) => t.key === tab)!;
  const view = def.views.find((v) => v.key === params.get('view'))?.key ?? def.views[0]?.key ?? '';
  return (
    <div className="page wide-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">What your runs say about you, and what each number rests on</div>
          <h1>Performance</h1>
        </div>
      </div>
      <div className="tabs page-tabs" role="tablist" aria-label="Performance sections">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" id={`tab-${t.key}`} aria-controls={tab === t.key ? `panel-${t.key}` : undefined} aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => router.replace(performanceHref(t.key))}>{t.name}</button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {/* A group's views are a second level, not a second row of tabs ("w performance w roznych zakladkach
            mam 2 poziomy tabow", answered "Views inside the card"): the group's card, a small switch of its
            views at the left of its head ("chce to po lewej stronie"), its name not said again under the
            tab that says it ("powtarzasz tytul"), the view under them. */}
        {def.views.length > 0 ? (
          <section className="perf-views-card" aria-label={def.name}>
            <header className="perf-views-head">
              <div className="segmented perf-views" role="radiogroup" aria-label={`${def.name} views`}>
                {def.views.map((v) => <button key={v.key} type="button" role="radio" aria-checked={view === v.key} className={view === v.key ? 'on' : ''} onClick={() => router.replace(performanceHref(tab, v.key))}>{v.name}</button>)}
              </div>
            </header>
            <Body tab={tab} view={view} />
          </section>
        ) : <Body tab={tab} view={view} />}
      </div>
    </div>
  );
}
