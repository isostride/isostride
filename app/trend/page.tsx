'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

/** The Trend screen became Analysis: old links (/trend?def=…) open the same block there. */
function TrendRedirect() {
  const params = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const def = params.get('def');
    router.replace(def ? `/analysis?items=b:${def}:0` : '/analysis');
  }, [params, router]);
  return <div className="page"><div className="page-head"><h1>Analysis</h1></div></div>;
}

export default function TrendPage() {
  return <Suspense><TrendRedirect /></Suspense>;
}
