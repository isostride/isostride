'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * The former Gear and tags screen (the author's request of 21 Nov 2026: "settings oraz gears and
 * tags ... w osobnych tabach"): gear and tags are tabs of Settings, so its links open there.
 */
export default function GearRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/settings?tab=gears'); }, [router]);
  return <div className="page muted">Opening Settings…</div>;
}
