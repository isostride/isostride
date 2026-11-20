'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * The former Blocks screen (the author's remodelling of 19 Nov 2026: "blocks nie maja duzego
 * sensu ... blocki sa wyliczane na biezaco z danych w analityce"): blocks are chosen and built
 * on the Analysis screen, so its links open there.
 */
export default function BlocksRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/analysis'); }, [router]);
  return <div className="page muted">Opening Analysis…</div>;
}
