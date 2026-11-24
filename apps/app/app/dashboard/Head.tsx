'use client';

import { useEffect, useState } from 'react';
import { useLocale } from '@/lib/client';
import { dateText, t } from '@/lib/i18n';

/** Today as the Dashboard's head shows it over its title: "Tuesday, November 24". */
export const todayText = (today = new Date()): string => dateText(today, { weekday: 'long', day: 'numeric', month: 'long' });

/**
 * The Dashboard's head while its data is read: the line of today's date held over the title from the
 * start (the page is built ahead of time, so the date is written once in the browser), so the title
 * does not move down when the tiles come ("tytul dashboard sie przesuwa ... bo chyba data powyzej
 * jest pobierana pozniej").
 */
export function DashboardHead() {
  const locale = useLocale();
  const [today, setToday] = useState(' ');
  useEffect(() => setToday(todayText()), [locale]);
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">{today}</div>
        <h1>{t('Dashboard')}</h1>
      </div>
    </div>
  );
}
