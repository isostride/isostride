'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { STATS, encodeRule, ruleOf, type RuleShape, type Stat } from '@/lib/blocks';

export default function AskRedirectWrapper() {
  return <Suspense><AskRedirect /></Suspense>;
}

/** The former Ask screen: its links open the same question as a block on the Analysis screen. */
function AskRedirect() {
  const p = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const window = (p.get('window') ?? '').match(/^(\d+)([sm])$/);
    const shape: RuleShape = p.get('kind') === 'best' && window ? { type: 'fastest', kind: window[2] === 's' ? 'time' : 'distance', target: Number(window[1]) } : { type: 'run' };
    const rule = ruleOf(shape);
    rule.runs = { ...rule.runs, dateFrom: p.get('from') || null, dateTo: p.get('to') || null, workoutTypes: p.get('tag') ? [p.get('tag')!] : [], shoes: p.get('shoes') ? [p.get('shoes')!] : [], title: p.get('title') ?? '' };
    if (STATS.includes(p.get('stat') as Stat)) rule.stat = p.get('stat') as Stat;
    const q = new URLSearchParams({ items: `q:${encodeRule(rule)}:0` });
    if (shape.type === 'run' && p.get('metric')) q.set('m', p.get('metric')!);
    router.replace(`/analysis?${q.toString()}`);
  }, [p, router]);
  return <div className="page muted">Opening in Analysis…</div>;
}
