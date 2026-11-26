'use client';

import { t } from '@/lib/i18n';

/**
 * Said where a screen could not read its data (a file of the folder damaged or cut short, the folder gone,
 * the browser's leave to read it withdrawn), with a way to try again: the screens stayed empty, or on
 * "Reading…", for good (the review of 26 Nov 2026).
 */
export function ReadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="card empty" role="alert">
      <p>{t('The data folder could not be read: a file in it is damaged, or the folder is no longer where it was.')}</p>
      <button type="button" className="btn" onClick={onRetry}>{t('Try again')}</button>
    </div>
  );
}
