'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useConfirm } from '@/components';
import { FOLDER_PATH_KEY, getValue, runInWorker, useFolder, useLocale, useOpenFolder, watchJob, type JobState } from '@/lib/client';
import { PATHS, isOutdated, readJson, readManifest, readReason, unseenFitFiles, type Manifest } from '@/lib/fs';
import { dateText, t, tn } from '@/lib/i18n';
import { ALGORITHM_VERSION, type RunsIndex } from '@/lib/kernel';
import { FolderPath } from './FolderPath';

type Job = 'import' | 'recompute';

/** "Imported 3 runs, 1 duplicate.": what a job did, in a sentence. */
function said(kind: Job, m: { imported: number; duplicates: number; errors: number }): string {
  const parts = [
    kind === 'recompute' ? tn(m.imported, 'Recomputed {n} run', 'Recomputed {n} runs') : tn(m.imported, 'Imported {n} run', 'Imported {n} runs'),
    ...(m.duplicates ? [tn(m.duplicates, '{n} duplicate', '{n} duplicates')] : []),
    ...(m.errors ? [tn(m.errors, '{n} could not be imported', '{n} could not be imported')] : []),
  ];
  return `${parts.join(', ')}.`;
}

/**
 * Why a file could not be imported (or a job failed), in the language in use: the manifest keeps it
 * in English, a key of the texts with its values filled in; a value that is itself a reason is read too.
 */
function reasonText(reason: string): string {
  const r = readReason(reason);
  return r ? t(r.key, Object.fromEntries(Object.entries(r.vars).map(([k, v]) => [k, reasonText(v)]))) : reason;
}

export default function FolderPageWrapper() {
  return <Suspense fallback={<div className="page wide-page folder-screen"><div className="page-head"><h1>{t('Data folder')}</h1></div></div>}><FolderPage /></Suspense>;
}

/**
 * The Data folder screen, opened from the logo (the runner's requests of 21 Nov 2026: "kwestie
 * zwiazane z folderem, recompute import daj w popupie ktory sie otworzy po klikieniu na ikone
 * stideprism", then "pod logiem nie chce popup ale normalna strone"): the folder and what it holds,
 * the import of its new files, the recompute of all, another folder, the files that could not be
 * imported and a warning when the data were built by an older algorithm. A job runs in the
 * Processing Worker: the screen may be left while it works, and says what it did.
 */
function FolderPage() {
  useLocale();
  const { folder, handle } = useOpenFolder();
  const { pick } = useFolder();
  const params = useSearchParams();
  const router = useRouter();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [facts, setFacts] = useState<{ runs: number; unseen: number; first: string | null; last: string | null } | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  const read = useCallback(async () => {
    const [index, m, unseen] = await Promise.all([readJson<RunsIndex>(folder, PATHS.runsIndex), readManifest(folder), unseenFitFiles(folder)]);
    const runs = index?.runs ?? [];
    setManifest(m);
    setFacts({ runs: runs.length, unseen: unseen.length, first: runs[0]?.startTime ?? null, last: runs[runs.length - 1]?.startTime ?? null });
  }, [folder]);
  useEffect(() => { read().catch(() => undefined); }, [read]);
  // The folder's path as typed, read before the screen is drawn below its heading (layout shift 0).
  const [folderPath, setFolderPath] = useState<string | null | undefined>(undefined);
  useEffect(() => { getValue<string | null>(FOLDER_PATH_KEY).then((p) => setFolderPath(p ?? null)).catch(() => setFolderPath(null)); }, [folder]);
  useEffect(() => {
    let was = false;
    return watchJob((j) => {
      const mine = j && (j.job === 'import' || j.job === 'recompute') ? j : null;
      setJob(mine);
      if (mine) was = true;
      else if (was) { was = false; read().catch(() => undefined); }
    });
  }, [read]);

  const [confirmDialog, confirm] = useConfirm();
  const run = useCallback(async (kind: Job) => {
    if (kind === 'recompute' && !(await confirm({ title: t('Recompute everything?'), message: t('All derived data are rebuilt from the FIT files. Your gear, tags and segments stay as they are.'), confirm: t('Recompute') }))) return;
    setMessage(null);
    try {
      setMessage(said(kind, await runInWorker(kind, handle)));
    } catch (e) {
      const error = reasonText(e instanceof Error ? e.message : String(e));
      setMessage(kind === 'recompute' ? t('Recompute failed: {error}', { error }) : t('Import failed: {error}', { error }));
    }
  }, [handle, confirm]);

  // ⌘K → Import folder lands here with ?action=import, and imports.
  useEffect(() => {
    if (params.get('action') === 'import' && !started.current) {
      started.current = true;
      router.replace('/folder');
      run('import');
    }
  }, [params, router, run]);

  const busy = job !== null;
  const files = Object.values(manifest?.files ?? {});
  const failed = Object.entries(manifest?.files ?? {}).filter(([, s]) => s.status === 'error') as [string, { status: 'error'; reason: string }][];
  const duplicates = files.filter((s) => s.status === 'duplicate').length;
  const day = (iso: string | null) => (iso ? dateText(iso, { day: 'numeric', month: 'short', year: 'numeric' }) : '–');

  return (
    <div className="page wide-page folder-screen">
      {confirmDialog}
      <div className="page-head">
        <div>
          <div className="eyebrow">{t('Where your runs come from: read in this browser, never sent anywhere')}</div>
          <h1>{t('Data folder')}</h1>
        </div>
      </div>
      {folderPath !== undefined && (<>

      {isOutdated(manifest) && (
        <div className="banner warn">{t('⚠ The data of this folder were built with algorithm v{old}; this app is v{now}. Recompute everything to rebuild them.', { old: manifest!.algorithmVersion, now: ALGORITHM_VERSION })}</div>
      )}

      <section className="card folder-page" aria-label={t('Folder')}>
        <div className="folder-top">
          <span className="folder-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
          </span>
          <div className="folder-name">
            <FolderPath name={folder.name} initial={folderPath ?? null} />
          </div>
          {facts && facts.unseen > 0 && <span className="folder-new tnum">{tn(facts.unseen, '{n} new file', '{n} new files')}</span>}
        </div>
        <dl className="folder-facts form-figures" aria-label={t('What the folder holds')}>
          <div><dt>{t('Runs')}</dt><dd className="tnum">{facts ? facts.runs : '–'}</dd></div>
          <div><dt>{t('FIT files read')}</dt><dd className="tnum">{files.length}</dd></div>
          <div><dt>{t('Duplicates')}</dt><dd className="tnum">{duplicates}</dd></div>
          <div><dt>{t('Could not be read')}</dt><dd className="tnum">{failed.length}</dd></div>
          <div><dt>{t('From')}</dt><dd>{day(facts?.first ?? null)}</dd></div>
          <div><dt>{t('To')}</dt><dd>{day(facts?.last ?? null)}</dd></div>
        </dl>
        <div className="folder-actions">
          <button type="button" className="btn primary" onClick={() => run('import')} disabled={busy}>{t('Import folder')}</button>
          <button type="button" className="btn" onClick={() => run('recompute')} disabled={busy}>{t('Recompute everything')}</button>
          <button type="button" className="btn ghost" onClick={() => pick().catch(() => undefined)} disabled={busy}>{t('Change folder…')}</button>
        </div>
        {busy && (
          <div className="folder-progress" role="status">
            <span className="muted small">{job!.job === 'recompute' ? t('Recomputing · {done} / {total} files', { done: job!.done, total: job!.total || '…' }) : t('Importing · {done} / {total} files', { done: job!.done, total: job!.total || '…' })}</span>
            <div className="progress"><div style={{ width: job!.total ? `${(100 * job!.done) / job!.total}%` : '3%' }} /></div>
          </div>
        )}
        {!busy && message && <div className="folder-message" role="status">{message}</div>}
        <div className="folder-notes muted small">
          <p><b>{t('Import folder')}</b> {t('reads only the FIT files no import has seen. New runs are also imported by themselves when you come back to the app.')}</p>
          <p><b>{t('Recompute everything')}</b> {t('builds all the derived data again from the FIT files; your gear, tags and segments stay as they are.')}</p>
          <p><b>{t('Change folder')}</b> {t('opens another folder of runs; this one is left as it is.')}</p>
        </div>
      </section>

      {failed.length > 0 && (
        <section className="card folder-failed" aria-label={t('Files that could not be imported')}>
          <h2>{t('Files that could not be imported')}</h2>
          <p className="muted small">{t('They are tried again by the next import.')}</p>
          <ul>{failed.map(([f, s]) => <li key={f}><b>{f.split('/').pop()}</b> <span className="muted">{reasonText(s.reason)}</span></li>)}</ul>
        </section>
      )}
      </>)}
    </div>
  );
}
