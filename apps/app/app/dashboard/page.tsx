'use client';

import dynamic from 'next/dynamic';
import { t } from '@/lib/i18n';
import { DashboardHead } from './Head';

const reading = () => <div className="page wide-page dashboard-page"><DashboardHead /><p className="muted small" role="status">{t('Reading your data…')}</p></div>;

/** The Dashboard's tiles, loaded after the screen shows, so the route's script stays in its budget. */
const DashboardPage = dynamic(() => import('./Board').then((m) => m.DashboardPage), { ssr: false, loading: reading });

export default function DashboardRoute() {
  return <DashboardPage />;
}
