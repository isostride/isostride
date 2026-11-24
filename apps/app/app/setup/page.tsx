'use client';

import dynamic from 'next/dynamic';
import { useLocale } from '@/lib/client';
import { t } from '@/lib/i18n';

/** The steps load after the screen shows, so the route's script stays in its budget (ADR "Built with React"). */
const Wizard = dynamic(() => import('./Wizard').then((m) => m.Wizard), { ssr: false, loading: () => <div className="page wide-page"><div className="page-head"><h1>{t('Setup')}</h1></div><p className="muted small" role="status">{t('Loading…')}</p></div> });

export default function SetupRoute() {
  // The wizard follows the language chosen in its Display step (requirement "Language chosen").
  useLocale();
  return <Wizard />;
}
