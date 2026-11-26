'use client';

import { useCallback, useState } from 'react';
import { runInWorker, setValue, getValue, useOpenFolder } from '@/lib/client';
import {
  COROS_CHANNEL,
  CorosError,
  CorosMcp,
  authorizeUrl,
  discoverCoros,
  exchangeCode,
  fetchCorosRuns,
  pkcePair,
  randomToken,
  registerClient,
  revokeTokens,
  type CorosConnection,
  type SignInAnswer,
} from '@/lib/coros';
import { dateText, t, tn } from '@/lib/i18n';
import { notify } from '@/components';
import { APP_VERSION } from '@/lib/kernel';

/** The connected account in this browser (requirement "COROS account connected": never in the data folder). */
export const COROS_KEY = 'coros';
/** IsoStride's registration with COROS, kept after Disconnect so a new connect does not register again. */
const CLIENT_KEY = 'corosClient';
/** How long the sign-in may take, ms. */
const SIGN_IN_TIMEOUT = 10 * 60 * 1000;

/** The answer of the sign-in of the given state; null when the window was closed without one. */
function signInAnswer(win: Window, state: string): Promise<SignInAnswer | null> {
  return new Promise((resolve) => {
    const channel = new BroadcastChannel(COROS_CHANNEL);
    const done = (a: SignInAnswer | null) => {
      channel.close();
      clearInterval(closed);
      clearTimeout(timeout);
      resolve(a);
    };
    channel.onmessage = (e: MessageEvent<SignInAnswer>) => { if (e.data?.state === state) done(e.data); };
    // A window closed by the runner: no answer comes (checked a while after, an answer may be on its way).
    const closed = setInterval(() => { if (win.closed) setTimeout(() => done(null), 1500); }, 700);
    const timeout = setTimeout(() => done(null), SIGN_IN_TIMEOUT);
  });
}

/** What the card did, said in a notice at the bottom right for 10 s (components/notify), as an import is. */
const say = (text: string, ids: string[] = []): void => notify({ text, ids });

/** A failure in the runner's words, COROS's own detail kept. */
function failure(e: unknown): string {
  if (e instanceof CorosError) {
    if (e.kind === 'auth') return t('COROS no longer accepts the sign-in: connect again. ({detail})', { detail: e.detail });
    if (e.kind === 'network') return t('COROS could not be reached: {detail}', { detail: e.detail });
    return t('COROS refused: {detail}', { detail: e.detail });
  }
  return t('Fetch failed: {error}', { error: e instanceof Error ? e.message : String(e) });
}

/**
 * COROS in the Integrations of the Data screen (requirements "COROS account connected", "Runs fetched
 * from COROS", "COROS fetch stopped kept"; ADR "COROS through its MCP server"): connect the runner's
 * COROS account in a window of COROS, fetch the runs the folder has not got into it and import them,
 * disconnect. The connection is read by the screen before it is drawn (layout shift 0).
 */
export function CorosCard({ initial, busy, off }: { initial: CorosConnection | null; busy: boolean; /** why the integration cannot be used here (the demo): the card is shown greyed, its buttons disabled */ off?: string }) {
  const { folder, handle } = useOpenFolder();
  const [conn, setConn] = useState<CorosConnection | null>(initial);
  /** what is being done now: connecting, or fetching with its count */
  const [work, setWork] = useState<{ kind: 'connect' } | { kind: 'fetch'; done: number; total: number } | null>(null);

  const keep = useCallback(async (c: CorosConnection | null) => {
    await setValue(COROS_KEY, c);
    setConn(c);
  }, []);

  const connect = useCallback(async () => {
    // Opened at once, in the click, so the browser does not block it; COROS's address comes after.
    const win = window.open('about:blank', 'coros-sign-in', 'popup,width=520,height=760');
    if (!win) return say(t('The browser blocked the COROS window: allow pop-ups for this site and try again.'));
    setWork({ kind: 'connect' });
    try {
      const server = await discoverCoros();
      const redirectUri = `${location.origin}/coros`;
      const saved = await getValue<{ issuer: string; redirectUri: string; clientId: string }>(CLIENT_KEY);
      let clientId = saved && saved.issuer === server.issuer && saved.redirectUri === redirectUri ? saved.clientId : null;
      if (!clientId) {
        clientId = await registerClient(server, redirectUri);
        await setValue(CLIENT_KEY, { issuer: server.issuer, redirectUri, clientId });
      }
      const { verifier, challenge } = await pkcePair();
      const state = randomToken();
      const answer = signInAnswer(win, state);
      win.location.href = authorizeUrl(server, clientId, redirectUri, challenge, state);
      const a = await answer;
      if (!a) return say(t('COROS was not connected: the window was closed.'));
      if (a.error || !a.code) return say(t('COROS was not connected: {detail}', { detail: a.error ?? '?' }));
      const tokens = await exchangeCode(server, clientId, redirectUri, a.code, verifier);
      await keep({ server, clientId, redirectUri, tokens, connectedAt: new Date().toISOString() });
      say(t('COROS connected. Fetch your runs below.'));
    } catch (e) {
      win.close();
      say(failure(e));
    } finally {
      setWork(null);
    }
  }, [keep]);

  const fetchRuns = useCallback(async () => {
    if (!conn) return;

    setWork({ kind: 'fetch', done: 0, total: 0 });
    try {
      const mcp = new CorosMcp(conn, keep, fetch, APP_VERSION);
      const report = await fetchCorosRuns(folder, mcp.call, { progress: (done, total) => setWork({ kind: 'fetch', done, total }) });
      // The files fetched imported at once, as the runner's own import (only the new files are read).
      const ids = report.files.length ? (await runInWorker('import', handle)).runIds ?? [] : [];
      const said = report.files.length ? tn(report.files.length, 'Fetched and imported {n} run from COROS.', 'Fetched and imported {n} runs from COROS.') : t('No new runs on COROS.');
      say(report.stopped ? `${said} ${t('Stopped by COROS: {detail} The rest comes with the next fetch.', { detail: report.stopped })}` : said, ids);
    } catch (e) {
      if (e instanceof CorosError && e.kind === 'auth') await keep(null);
      say(failure(e));
    } finally {
      setWork(null);
    }
  }, [conn, folder, handle, keep]);

  const disconnect = useCallback(async () => {
    if (conn) await revokeTokens(conn);
    await keep(null);
    say(t('COROS disconnected. The runs fetched stay in the folder.'));
  }, [conn, keep]);

  const working = work !== null || busy;
  return (
    <section className={`card folder-page coros-card ${off ? 'off' : ''}`} aria-label="COROS" aria-disabled={off ? true : undefined}>
      <div className="folder-top">
        <span className="folder-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="7" /><path d="M12 9v3l2 1.5" /><path d="M9 2h6M9 22h6" /></svg>
        </span>
        <div className="coros-name">
          <b>COROS</b>
          <span className="muted small">
            {off ? t('Off in the demo') : conn ? t('Connected since {date}', { date: dateText(conn.connectedAt, { day: 'numeric', month: 'short', year: 'numeric' }) }) : t('Not connected')}
          </span>
        </div>
      </div>
      <div className="folder-actions">
        {conn && !off ? (
          <>
            <button type="button" className="btn primary" onClick={fetchRuns} disabled={working}>{t('Fetch runs from COROS')}</button>
            <button type="button" className="btn ghost" onClick={disconnect} disabled={working}>{t('Disconnect')}</button>
          </>
        ) : (
          <button type="button" className="btn primary" onClick={connect} disabled={working || !!off}>{t('Connect COROS')}</button>
        )}
      </div>
      {work && (
        <div className="folder-progress" role="status">
          <span className="muted small">
            {work.kind === 'connect' ? t('Waiting for COROS: sign in and allow IsoStride in its window…') : t('Fetching from COROS · {done} / {total} runs', { done: work.done, total: work.total || '…' })}
          </span>
          {work.kind === 'fetch' && <div className="progress"><div style={{ width: work.total ? `${(100 * work.done) / work.total}%` : '3%' }} /></div>}
        </div>
      )}
      {off && <p className="integration-off small">{off}</p>}
      <div className="folder-notes muted small">
        <p><b>{t('Fetch runs from COROS')}</b> {t('brings the FIT files of your runs from your COROS account into this folder (the last 30 days at first, then since the last fetch) and imports them. COROS gives at most 50 files a day.')}</p>
        <p><b>{t('Connect COROS')}</b> {t('signs you in on COROS’s own page. The sign-in is kept in this browser only, not in the folder, and goes to no one but COROS.')}</p>
      </div>
    </section>
  );
}
