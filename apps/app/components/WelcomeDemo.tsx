'use client';

import { useFolder } from '@/lib/client';
import { number, t } from '@/lib/i18n';

/**
 * The demo on the Welcome screen (the runner's request of 26 Nov 2026: "chce na stronie umiesicc opcje
 * demo"): its offer under the choice of a folder, where the browser can make it (a folder in the
 * browser's own storage, which Firefox and Safari have too); and, while its last months are made, how
 * far that is (`total` given).
 */
export function WelcomeDemo({ done = 0, total }: { done?: number; total?: number }) {
  const { openDemo } = useFolder();
  if (total === undefined) {
    return (
      <div className="welcome-demo">
        <p className="muted small">{t('No runs at hand? Look around first: the demo is two years of training of a sample runner, generated here in your browser.')}</p>
        <button className="btn" onClick={() => { void openDemo(); }}>{t('Try the demo')}</button>
      </div>
    );
  }
  return (
    <>
      <h2>{t('Preparing the demo')}</h2>
      <p>{t('Two years of training of a sample runner are being generated here, in your browser. Nothing is downloaded and nothing is sent.')}</p>
      <div className="welcome-making" role="status">
        <div className="progress"><div style={{ width: total ? `${(100 * done) / total}%` : '3%' }} /></div>
        <span className="muted small tnum">{total ? t('The last months first · run {done} of {total}', { done: number(Math.min(total, done + 1)), total: number(total) }) : t('Starting…')}</span>
      </div>
      <p className="muted small">{t('The app opens in a few seconds; the earlier history is added behind it.')}</p>
    </>
  );
}
