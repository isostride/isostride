'use client';

import { useFolder } from '@/lib/client';
import { Logo } from './Logo';
import { SETUP_CONTINUE, SetupSteps } from './SetupSteps';

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
          <h1>Stride<i className="brand-dot">Prism</i></h1>
          <p>Compare the same segments of your runs in the same context, and see changes the watch averages hide.</p>
          <ul className="welcome-points">
            <li>Your runs from your watch&apos;s FIT files</li>
            <li>Segments and efforts compared over time</li>
            <li>Models that say how far to trust them</li>
          </ul>
          {state.status !== 'unsupported' && <p className="note">🔒 Your data never leaves this computer.</p>}
        </aside>
        <section className="welcome-step" aria-label="Setup">
          {state.status === 'unsupported' && (
            <div className="banner err">
              <span>⚠</span>
              {state.insecure ? (
                <span>
                  <b>Open this page over https.</b> Browsers give a page access to a folder only over https (or on localhost); this address is plain http.
                </span>
              ) : (
                <span>
                  <b>Browser not supported.</b> Open StridePrism in Chrome, Edge or Opera: it needs access to a folder on your disk.
                </span>
              )}
            </div>
          )}
          {state.status === 'not-chosen' && (
            <>
              <div className="welcome-progress">
                <span>Setup · step 1 of 8</span>
                <SetupSteps at={0} compact />
              </div>
              <h2>Choose your data folder</h2>
              <p>The folder with your watch&apos;s FIT files, or an empty one to put them in. StridePrism reads it here, in your browser, and keeps its own files beside them.</p>
              <p className="muted small">Your browser asks you to pick it: a web page cannot open a folder by itself.</p>
              <button className="btn primary" onClick={() => { try { sessionStorage.setItem(SETUP_CONTINUE, '1'); } catch { /* the wizard opens by its own rule */ } pick().catch(() => undefined); }}>
                Choose data folder
              </button>
              <p className="muted small welcome-next">Next: your runs, you, your zones, gear, the load model and the display. A few minutes; each step can be skipped.</p>
            </>
          )}
          {state.status === 'access-pending' && (
            <>
              <h2>Welcome back</h2>
              <p>Your browser asks again for the folder you chose last time.</p>
              <button className="btn primary" onClick={() => confirmAccess()}>
                Continue with {state.name}
              </button>
              <button className="btn" onClick={() => pick().catch(() => undefined)}>
                Choose another folder
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
