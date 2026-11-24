'use client';

import { useEffect, useState } from 'react';
import { useLocale } from '@/lib/client';
import { t } from '@/lib/i18n';
import { COROS_CHANNEL, type SignInAnswer } from '@/lib/coros';

/**
 * Where COROS's sign-in comes back (requirement "COROS account connected"), in the window the Data
 * folder screen opened: the code (or COROS's refusal) is handed to that screen over a channel of this
 * origin and the window closes. It is drawn without the app around it (components/Shell): it needs no
 * folder.
 */
export default function CorosSignIn() {
  useLocale();
  const [sent, setSent] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const answer: SignInAnswer = { state: q.get('state'), code: q.get('code'), error: q.get('error_description') ?? q.get('error') };
    const channel = new BroadcastChannel(COROS_CHANNEL);
    channel.postMessage(answer);
    channel.close();
    setSent(true);
    // The address with its code is not kept in the history.
    history.replaceState(null, '', '/coros');
    setTimeout(() => window.close(), 300);
  }, []);
  return (
    <div className="page">
      <div className="page-head"><h1>COROS</h1></div>
      <p className="muted">{sent ? t('Done: you can close this window and go back to IsoStride.') : t('Connecting COROS…')}</p>
    </div>
  );
}
