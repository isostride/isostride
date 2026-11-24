'use client';

import { useState } from 'react';
import { instancesInWorker, useOpenFolder } from '@/lib/client';
import { BrowserFolder, MirroredFolder, PATHS, diagnose, diagnosticText } from '@/lib/fs';
import { t } from '@/lib/i18n';
import { APP_COMMIT, APP_VERSION } from '@/lib/kernel';

/** The long tasks of this page since it loaded (the browser keeps them), as one line. */
function longTasks(): Promise<string> {
  return new Promise((resolve) => {
    try {
      const seen: number[] = [];
      const o = new PerformanceObserver((l) => { for (const e of l.getEntries()) seen.push(e.duration); });
      o.observe({ type: 'longtask', buffered: true });
      setTimeout(() => {
        o.disconnect();
        const total = Math.round(seen.reduce((a, b) => a + b, 0));
        resolve(`${seen.length}, ${total} ms in all, the longest ${Math.round(Math.max(0, ...seen))} ms`);
      }, 50);
    } catch {
      resolve('not measured in this browser');
    }
  });
}

/**
 * Diagnostics of this device (the runner's "isostride dziala tam bardzo wolno" on a fast Android
 * phone, "zrob diagnostyka w inny sposb" when its browser could not be inspected from a computer):
 * the folder's reads, a job in the background and the device, measured here, as text to copy and send.
 * Nothing leaves the device unless the runner sends it.
 */
export function Diagnostics() {
  const { folder, handle } = useOpenFolder();
  const [text, setText] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setRunning(true);
    setCopied(false);
    try {
      const steps = await diagnose(() => new BrowserFolder(handle), undefined, () => BrowserFolder.operations);
      const t0 = performance.now();
      await instancesInWorker([], handle);
      const job = Math.round(performance.now() - t0);
      // The copy in the browser (ADR "A copy in the browser on phones"): kept or not, its room, a read through it.
      const est = await navigator.storage?.estimate?.().catch(() => undefined);
      const mb = (n?: number) => (n === undefined ? '?' : `${Math.round(n / 1048576)} MB`); // i18n-ignore: the report is sent as it is, in English
      const copied = folder instanceof MirroredFolder;
      const t1 = performance.now();
      await folder.readText(PATHS.runsIndex);
      const through = Math.round(performance.now() - t1);
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      const nv = navigator as Navigator & { deviceMemory?: number };
      const lines = [
        `IsoStride ${APP_VERSION}${APP_COMMIT ? ` (${APP_COMMIT})` : ''}`, // i18n-ignore: the report is sent as it is
        `device: ${navigator.userAgent}`, // i18n-ignore: the report is sent as it is
        `cores ${navigator.hardwareConcurrency ?? '?'}, memory ${nv.deviceMemory ?? '?'} GB, screen ${screen.width}×${screen.height} @${devicePixelRatio}`, // i18n-ignore: the report is sent as it is
        nav ? `page load: ${Math.round(nav.domContentLoadedEventEnd)} ms to DOM ready, ${Math.round(nav.loadEventEnd)} ms to load` : 'page load: not measured', // i18n-ignore: the report is sent as it is
        `long tasks since the page loaded: ${await longTasks()}`, // i18n-ignore: the report is sent as it is
        diagnosticText(steps),
        `a job in the background worker (no work): ${job} ms`, // i18n-ignore: the report is sent as it is
        `copy in the browser: ${copied ? 'on' : 'off'}; storage of this site ${mb(est?.usage)} of ${mb(est?.quota)}`, // i18n-ignore: the report is sent as it is
        `read runs-index.json as the app does${copied ? ' (through the copy)' : ''}: ${through} ms`, // i18n-ignore: the report is sent as it is
      ];
      setText(lines.join('\n'));
    } catch (e) {
      setText(`${t('Diagnostics failed: {error}', { error: e instanceof Error ? e.message : String(e) })}`);
    } finally {
      setRunning(false);
    }
  };

  const copy = async () => {
    if (!text) return;
    await navigator.clipboard.writeText(text).then(() => setCopied(true)).catch(() => setCopied(false));
  };

  return (
    <div className="display-row diagnostics">
      <div>
        <div className="display-name">{t('Diagnostics')}</div>
        <div className="muted small">{t('Measures on this device how long the folder takes to read and the app to work, as text to copy and send when the app is slow. Nothing is sent by itself.')}</div>
        {text && <textarea className="input diagnostics-text" readOnly value={text} rows={14} aria-label={t('Diagnostics')} />}
      </div>
      <div className="diagnostics-actions">
        <button type="button" className="btn" onClick={run} disabled={running}>{running ? t('Measuring…') : t('Run diagnostics')}</button>
        {text && <button type="button" className="btn" onClick={copy}>{copied ? t('Copied') : t('Copy')}</button>}
      </div>
    </div>
  );
}
