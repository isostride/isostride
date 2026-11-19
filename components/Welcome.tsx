'use client';

import { useFolder } from '@/lib/client';

/** Welcome: pick the data folder, confirm access to the remembered one, or say the browser is not supported. */
export function Welcome() {
  const { state, pick, confirmAccess } = useFolder();
  if (state.status === 'checking') return <div className="welcome" />;
  return (
    <div className="welcome">
      <div className="card">
        <div className="brand-mark" />
        <h1>Strideprism</h1>
        <p className="muted">Compare blocks of your runs in the same context, and see changes the watch averages hide.</p>
        {state.status === 'unsupported' && (
          <div className="banner err" style={{ marginTop: 18, textAlign: 'left' }}>
            <span>⚠</span>
            <span>
              <b>Browser not supported.</b> Open Strideprism in Chrome, Edge or Opera: it needs access to a folder on your disk.
            </span>
          </div>
        )}
        {state.status === 'not-chosen' && (
          <button className="btn primary" onClick={() => pick().catch(() => undefined)}>
            Choose data folder
          </button>
        )}
        {state.status === 'access-pending' && (
          <>
            <button className="btn primary" onClick={() => confirmAccess()}>
              Continue with {state.name}
            </button>
            <button className="btn" style={{ marginTop: 8 }} onClick={() => pick().catch(() => undefined)}>
              Choose another folder
            </button>
          </>
        )}
        {state.status !== 'unsupported' && <p className="note">🔒 Your data never leaves this computer.</p>}
      </div>
    </div>
  );
}
