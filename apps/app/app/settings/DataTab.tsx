'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { notify, useConfirm } from '@/components';
import { getValue, runInWorker, useFolder, useOpenFolder, watchJob, type JobState } from '@/lib/client';
import { PATHS, isOutdated, readJson, readManifest, readReason, unseenFitFiles, type Manifest } from '@/lib/fs';
import { dateText, t, tn } from '@/lib/i18n';
import { ALGORITHM_VERSION, type RunsIndex } from '@/lib/kernel';
import type { CorosConnection } from '@/lib/coros';
import { COROS_KEY, CorosCard } from './CorosCard';

/** A job of the screen and of the import by itself, whose progress and outcome it shows. */
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

/**
 * The Data tab of Settings, its first (the runner's requests of 21 Nov 2026: "kwestie zwiazane z
 * folderem, recompute import daj w popupie ktory sie otworzy po klikieniu na ikone stideprism", then
 * "pod logiem nie chce popup ale normalna strone", and of 24 Nov 2026: "menu data pod logiem jest
 * bezsensu .. przesun je cale pod settings ... jako pierwzza zakladka"): the folder and what it holds,
 * the recompute of all, another folder, the files that could not be imported, the integrations and a
 * warning when the data were built by an older algorithm. A job runs in the Processing Worker: the tab
 * may be left while it works, and says what it did.
 */
export function DataTab() {
  const { folder, handle } = useOpenFolder();
  const { pick } = useFolder();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [facts, setFacts] = useState<{ runs: number; unseen: number; first: string | null; last: string | null } | null>(null);
  const [job, setJob] = useState<JobState | null>(null);

  const read = useCallback(async () => {
    const [index, m, unseen] = await Promise.all([readJson<RunsIndex>(folder, PATHS.runsIndex), readManifest(folder), unseenFitFiles(folder)]);
    const runs = index?.runs ?? [];
    setManifest(m);
    setFacts({ runs: runs.length, unseen: unseen.length, first: runs[0]?.startTime ?? null, last: runs[runs.length - 1]?.startTime ?? null });
  }, [folder]);
  useEffect(() => { read().catch(() => undefined); }, [read]);
  // The COROS account connected in this browser, read before the screen is drawn below its heading
  // (layout shift 0: its card is drawn whole at once). Undefined until read.
  const [coros, setCoros] = useState<CorosConnection | null | undefined>(undefined);
  useEffect(() => {
    getValue<CorosConnection | null>(COROS_KEY).catch(() => null).then((c) => setCoros(c ?? null));
  }, [folder]);
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
    // What it did, as a notice at the bottom right (components/notify), as an import's.
    try {
      const done = await runInWorker(kind, handle);
      notify({ text: said(kind, done), ids: done.runIds ?? [] });
    } catch (e) {
      const error = reasonText(e instanceof Error ? e.message : String(e));
      notify({ text: kind === 'recompute' ? t('Recompute failed: {error}', { error }) : t('Import failed: {error}', { error }) });
    }
  }, [handle, confirm]);

  const busy = job !== null;
  const files = Object.values(manifest?.files ?? {});
  const failed = Object.entries(manifest?.files ?? {}).filter(([, s]) => s.status === 'error') as [string, { status: 'error'; reason: string }][];
  const dupes = Object.entries(manifest?.files ?? {}).filter(([, s]) => s.status === 'duplicate') as [string, { status: 'duplicate'; runId: string }][];
  const duplicates = dupes.length;
  const day = (iso: string | null) => (iso ? dateText(iso, { day: 'numeric', month: 'short', year: 'numeric' }) : '–');

  return (
    <section className="folder-screen" aria-label={t('Data')}>
      {confirmDialog}
      {coros !== undefined && (<>

      {isOutdated(manifest) && (
        <div className="banner warn">{t('⚠ The data of this folder were built with algorithm v{old}; this app is v{now}: they are rebuilt by themselves now.', { old: manifest!.algorithmVersion, now: ALGORITHM_VERSION })}</div>
      )}

      <section className="card folder-page" aria-label={t('Folder')}>
        <div className="folder-top">
          <span className="folder-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
          </span>
          <div className="folder-name">
            <b>{folder.name}</b>
            <span className="muted small">{t('FIT files in this folder or its fit/ subfolder')}</span>
          </div>
          {facts && facts.unseen > 0 && <span className="folder-new tnum">{tn(facts.unseen, '{n} new file', '{n} new files')}</span>}
          {/* Another folder, a choice of its own ("change folder daj osobny niebieskim kolorem"). */}
          <button type="button" className="btn primary folder-change" onClick={() => pick().catch(() => undefined)} disabled={busy}>{t('Change folder…')}</button>
        </div>
        <dl className="folder-facts form-figures" aria-label={t('What the folder holds')}>
          <div><dt>{t('Runs')}</dt><dd className="tnum">{facts ? facts.runs : '–'}</dd></div>
          <div><dt>{t('FIT files read')}</dt><dd className="tnum">{files.length}</dd></div>
          <div><dt>{t('Duplicates')}</dt><dd className="tnum">{duplicates}</dd></div>
          <div><dt>{t('Could not be read')}</dt><dd className="tnum">{failed.length}</dd></div>
          <div><dt>{t('From')}</dt><dd className="folder-day">{day(facts?.first ?? null)}</dd></div>
          <div><dt>{t('To')}</dt><dd className="folder-day">{day(facts?.last ?? null)}</dd></div>
        </dl>
        {busy && (
          <div className="folder-progress" role="status">
            <span className="muted small">{job!.job === 'recompute' ? t('Recomputing · {done} / {total} files', { done: job!.done, total: job!.total || '…' }) : t('Importing · {done} / {total} files', { done: job!.done, total: job!.total || '…' })}</span>
            <div className="progress"><div style={{ width: job!.total ? `${(100 * job!.done) / job!.total}%` : '3%' }} /></div>
          </div>
        )}
        {/* Logs ("to daj do zakladki rozwijanej jako logs"): how the import works, the files that could not be
            read and the duplicates, and Recompute everything for a repair, folded away until opened. */}
        <details className="folder-logs">
          <summary>
            {t('Logs')}
            {failed.length > 0 && <span className="chip warn-chip">{tn(failed.length, '{n} could not be read', '{n} could not be read')}</span>}
            {dupes.length > 0 && <span className="chip">{tn(dupes.length, '{n} duplicate', '{n} duplicates')}</span>}
          </summary>
          <div className="folder-notes muted small">
            <p>{t('Every FIT file of the folder is imported by itself: all of them when the folder is chosen, then each new one when the app opens or you come back to it. A file that could not be read is tried again when the app opens.')}</p>
            <p><b>{t('Change folder')}</b> {t('opens another folder of runs; this one is left as it is.')}</p>
          </div>
          {failed.length > 0 && (
            <section className="folder-log" aria-label={t('Files that could not be imported')}>
              <h3>{t('Files that could not be imported')}</h3>
              <p className="muted small">{t('A file cut short (still being copied, say) is tried again when the app opens; one that is not a run stays left out.')}</p>
              <ul>{failed.map(([f, s]) => <li key={f}><b>{f.split('/').pop()}</b> <span className="muted">{reasonText(s.reason)}</span></li>)}</ul>
            </section>
          )}
          {dupes.length > 0 && (
            <section className="folder-log" aria-label={t('Duplicates')}>
              <h3>{t('Duplicates')}</h3>
              <p className="muted small">{t('Files of a run already imported from another file: left out.')}</p>
              <ul>{dupes.map(([f, s]) => <li key={f}><b>{f.split('/').pop()}</b> <Link className="muted" href={`/run?id=${s.runId}`}>{t('the run it repeats')}</Link></li>)}</ul>
            </section>
          )}
          <section className="folder-log" aria-label={t('Recompute everything')}>
            <h3>{t('Recompute everything')}</h3>
            <p className="muted small">{t('Builds all the derived data again from the FIT files; your gear, tags and segments stay as they are. A new version of the app does it by itself; do it yourself only when the data look wrong or a FIT file already imported was changed.')}</p>
            <button type="button" className="btn" onClick={() => run('recompute')} disabled={busy}>{t('Recompute everything')}</button>
          </section>
        </details>
      </section>

      {/* The sources the runs can come from besides the folder itself ("w data ... wyszczegolni sekcje integracje ... i tam daj coros"). */}
      <section className="integrations" aria-labelledby="integrations-title">
        <h2 id="integrations-title" className="section-title">{t('Integrations')} <span className="muted">· {t('services your runs can be fetched from into this folder')}</span></h2>
        <CorosCard initial={coros ?? null} busy={busy} />
      </section>
      </>)}
    </section>
  );
}
