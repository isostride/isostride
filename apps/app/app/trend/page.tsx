'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { t } from '@/lib/i18n';

/** The Trend screen became Analysis: old links (/trend?def=…) open the same block there. */
function TrendRedirect() {
  const params = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const def = params.get('def');
    router.replace(def ? `/compare?items=b:${def}:0` : '/compare');
  }, [params, router]);
  return <div className="page"><div className="page-head"><h1>{t('Compare')}</h1></div></div>;
}

export default function TrendPage() {
  return <Suspense><TrendRedirect /></Suspense>;
}
