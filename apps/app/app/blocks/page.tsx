'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { t } from '@/lib/i18n';

export default function BlocksRedirectWrapper() {
  return <Suspense><BlocksRedirect /></Suspense>;
}

/**
 * The former Blocks screen: a block is a segment now (the runner's choice of 22 Nov 2026, "uzyj
 * segment + effort"); its links open the Segments screen, with what they asked for (?new=1).
 */
function BlocksRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    const q = params.toString();
    router.replace(`/segments${q ? `?${q}` : ''}`);
  }, [router, params]);
  return <div className="page muted">{t('Opening Segments…')}</div>;
}
