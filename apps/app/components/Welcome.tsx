'use client';

import { useFolder } from '@/lib/client';
import { number, t } from '@/lib/i18n';
import { Logo } from './Logo';
import { SETUP_CONTINUE, SETUP_STEPS, SetupSteps } from './SetupSteps';

/**
 * Welcome: the setup's first step (the runner's "przy starcie pierwszym powinien uruchamiac wizarda",
 * "uruchomilem w incognito i dalej pyta o folder"): pick the data folder, the wizard's steps shown
 * ahead; or confirm access to the remembered one; or say the browser is not supported.
 */
export function Welcome() {
  const { state, pick, confirmAccess } = useFolder();
  if (state.status === 'checking') return <div className="welcome" />;
  return (
    <div className="welcome">
      <div className="card welcome-card">
        <aside className="welcome-brand">
          <Logo size={56} />
          <h1>Iso<i className="brand-dot">Stride</i></h1>
          <p>{t('Compare the same segments of your runs in the same context, and see changes the watch averages hide.')}</p>
          <ul className="welcome-points">
            <li>{t("Your runs from your watch's FIT files")}</li>
            <li>{t('Segments and efforts compared over time')}</li>
            <li>{t('Models that say how far to trust them')}</li>
          </ul>
          {state.status !== 'unsupported' && <p className="note">🔒 {t('Your data never leaves this computer.')}</p>}
        </aside>
        <section className="welcome-step" aria-label={t('Setup')}>
          {state.status === 'unsupported' && (
            <div className="banner err">
              <span>⚠</span>
              {state.insecure ? (
                <span>
                  <b>{t('Open this page over https.')}</b> {t('Browsers give a page access to a folder only over https (or on localhost); this address is plain http.')}
                </span>
              ) : (
                <span>
                  <b>{t('Browser not supported.')}</b> {t('Open IsoStride in Chrome, Edge or Opera: it needs access to a folder on your disk.')}
                </span>
              )}
            </div>
          )}
          {state.status === 'not-chosen' && (
            <>
              <div className="welcome-progress">
                <span>{t('Setup · step {step} of {steps}', { step: number(1), steps: number(SETUP_STEPS.length) })}</span>
                <SetupSteps at={0} compact />
              </div>
              <h2>{t('Choose your data folder')}</h2>
              <p>{t("The folder with your watch's FIT files, or an empty one to put them in. IsoStride reads it here, in your browser, and keeps its own files beside them.")}</p>
              <p className="muted small">{t('Your browser asks you to pick it: a web page cannot open a folder by itself.')}</p>
              <button className="btn primary" onClick={() => { try { sessionStorage.setItem(SETUP_CONTINUE, '1'); } catch { /* the wizard opens by its own rule */ } pick().catch(() => undefined); }}>
                {t('Choose data folder')}
              </button>
              <p className="muted small welcome-next">{t('Next: your runs, you, your zones, gear, the load model and the display. A few minutes; each step can be skipped.')}</p>
            </>
          )}
          {state.status === 'access-pending' && (
            <>
              <h2>{t('Welcome back')}</h2>
              <p>{t('Your browser asks again for the folder you chose last time.')}</p>
              <button className="btn primary" onClick={() => confirmAccess()}>
                {t('Continue with {name}', { name: state.name })}
              </button>
              <button className="btn" onClick={() => pick().catch(() => undefined)}>
                {t('Choose another folder')}
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
