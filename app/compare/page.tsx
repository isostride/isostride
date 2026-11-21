'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

export default function CompareRedirectWrapper() {
  return <Suspense><CompareRedirect /></Suspense>;
}

/**
 * The former A/B comparison screen (the author's answer of 21 Nov 2026: "tak doloz" to A/B as a
 * tab of Analysis): its links open the A/B tab, a block's link (def=…) with that block.
 */
function CompareRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    const def = params.get('def');
    router.replace(def ? `/analysis?items=b:${encodeURIComponent(def)}:0&tab=ab&ab=${encodeURIComponent(def)}` : '/analysis?tab=ab');
  }, [router, params]);
  return <div className="page muted">Opening Analysis…</div>;
}
