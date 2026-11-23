'use client';

import dynamic from 'next/dynamic';

/** The steps load after the screen shows, so the route's script stays in its budget (ADR "Built with React"). */
const Wizard = dynamic(() => import('./Wizard').then((m) => m.Wizard), { ssr: false, loading: () => <div className="page wide-page"><div className="page-head"><h1>Setup</h1></div><p className="muted small" role="status">Loading…</p></div> });

export default function SetupRoute() {
  return <Wizard />;
}
