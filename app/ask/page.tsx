'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { bestWindow, datesPeriod, formatRunSet, type MetricKey, type Stat } from '@/lib/ask';

export default function AskRedirectWrapper() {
  return <Suspense><AskRedirect /></Suspense>;
}

/** The former Ask screen: its links open the same question as a run set on the Analysis screen. */
function AskRedirect() {
  const p = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const stat = (['avg', 'median', 'min', 'max'].includes(p.get('stat') ?? '') ? p.get('stat') : 'avg') as Stat;
    const set = { period: datesPeriod(p.get('from'), p.get('to')), filters: { workoutType: p.get('tag') || null, shoes: p.get('shoes') || null, title: p.get('title') || null }, stat };
    const window = (p.get('window') ?? '').match(/^(\d+)([sm])$/);
    const metric: MetricKey = p.get('kind') === 'best' && window && bestWindow(`best:${window[1]}${window[2]}`) ? `best:${window[1]}${window[2]}` : ((p.get('metric') || 'speed') as MetricKey);
    router.replace(`/analysis?${new URLSearchParams({ items: `s:${formatRunSet(set)}:0`, m: metric }).toString()}`);
  }, [p, router]);
  return <div className="page muted">Opening in Analysis…</div>;
}
