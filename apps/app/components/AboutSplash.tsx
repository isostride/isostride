'use client';

import { useEffect, useRef } from 'react';
import { t } from '@/lib/i18n';
import { APP_BUILT, APP_COMMIT, APP_VERSION, releaseNotesUrl, versionLabel } from '@/lib/kernel';
import { Logo } from './Logo';

/**
 * The splash the logo opens (the runner's request of 24 Nov 2026: "klikniecie na logo pokazuje popup z
 * logiem, krotka informacje o aplikacji i numerem wersji ... taki splash"): the mark, the app's name and
 * what it is, its version with the commit and the date of its build, and the release notes of the version.
 * Esc, a click beside it or Close closes it; Tab stays within it.
 */
export function AboutSplash({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('.splash-close')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close.current(); }
      if (e.key === 'Tab' && box.current) {
        const all = [...box.current.querySelectorAll<HTMLElement>('a[href], button')];
        const [a, z] = [all[0], all[all.length - 1]];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); before?.focus?.(); };
  }, []);
  return (
    <div className="edit-backdrop" onClick={onClose}>
      <div ref={box} className="splash" role="dialog" aria-modal="true" aria-labelledby="splash-name" onClick={(e) => e.stopPropagation()}>
        <Logo size={72} />
        <h2 id="splash-name" className="splash-name"><span className="brand-name">Iso<i className="brand-dot">Stride</i></span></h2>
        <p className="splash-tagline">{t('An open platform for analysing your running training')}</p>
        <p className="splash-text">{t('Compare the same segments of your runs in the same context, and see changes the watch averages hide.')}</p>
        <p className="splash-text muted small">🔒 {t('Your data never leaves this computer.')}</p>
        <div className="splash-version">
          <b>{t('Version {version}', { version: versionLabel(APP_VERSION) })}</b>
          <span className="muted small">
            {APP_VERSION}
            {APP_COMMIT && <> · {t('commit')} <code>{APP_COMMIT}</code></>}
            {APP_BUILT && <> · {t('built {date}', { date: APP_BUILT })}</>}
          </span>
        </div>
        <div className="splash-actions">
          <a className="btn" href={releaseNotesUrl(APP_VERSION)}>{t('Release notes')}</a>
          <button type="button" className="btn primary splash-close" onClick={onClose}>{t('Close')}</button>
        </div>
      </div>
    </div>
  );
}
