'use client';

import dynamic from 'next/dynamic';

const reading = () => <div className="page wide-page"><div className="page-head"><h1>Dashboard</h1></div><p className="muted small" role="status">Reading your data…</p></div>;

/** The Dashboard's tiles, loaded after the screen shows, so the route's script stays in its budget. */
const DashboardPage = dynamic(() => import('./Board').then((m) => m.DashboardPage), { ssr: false, loading: reading });

export default function DashboardRoute() {
  return <DashboardPage />;
}
