'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { t } from '@/lib/i18n';

export default function AnalysisRedirectWrapper() {
  return <Suspense><AnalysisRedirect /></Suspense>;
}

/**
 * The former Analysis screen, Compare now (the runner's answer of 22 Nov 2026, "tak", to "Compare
 * (zamiast Analysis)"): its links open Compare with all they carry; a segment it named (def=…) is
 * its item there.
 */
function AnalysisRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    const q = new URLSearchParams(params.toString());
    const def = q.get('def');
    if (def && !q.has('items')) { q.delete('def'); q.set('items', `b:${def}:0`); }
    const s = q.toString();
    router.replace(`/compare${s ? `?${s}` : ''}`);
  }, [router, params]);
  return <div className="page muted">{t('Opening Compare…')}</div>;
}
