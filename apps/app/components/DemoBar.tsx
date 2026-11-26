'use client';

import { useFolder } from '@/lib/client';
import { number, t } from '@/lib/i18n';

/**
 * The demo said on every screen (the runner's "nie chozdi o to aby ukrywac ze nie jest to realny
 * zawodnik"): the data are a sample runner's, with the way out to the visitor's own; while the earlier
 * history is still being made behind the app, how far it is.
 */
export function DemoBar() {
  const { demoHistory, leaveDemo } = useFolder();
  return (
    <aside className="demo-bar" aria-label={t('Demo data')}>
      <span className="demo-chip">{t('Demo')}</span>
      {/* On a phone the first words alone: the bar stays one or two lines. With no room in the browser for the two years, what there is said. */}
      <span className="demo-text"><b>{t('A sample runner.')}</b> <span className="demo-more">{demoHistory === 'short' ? t('The last months of training, generated in your browser: it has too little room for the two years. Nobody’s real data.') : t('Two years of training, generated in your browser. Nobody’s real data.')}</span></span>
      {demoHistory && demoHistory !== 'short' && demoHistory.total > 0 && (
        // On a phone the share alone: the bar stays one line, and the screen under it does not move when the history is in.
        <span className="demo-history tnum" role="status"><span className="demo-history-what">{t('Adding the earlier history')} · </span>{t('{percent} %', { percent: number(Math.floor((100 * demoHistory.done) / demoHistory.total)) })}</span>
      )}
      <button type="button" className="btn sm" onClick={() => { void leaveDemo(); }}>{t('Use your own data')}</button>
    </aside>
  );
}
