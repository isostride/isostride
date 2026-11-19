'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useOpenFolder, runInWorker, watchJob } from '@/lib/client';
import { PATHS, readJson, isOutdated, readManifest, type Manifest } from '@/lib/fs';
import { type RunsIndex, ALGORITHM_VERSION } from '@/lib/kernel';
import { date, duration, km, pace, time } from '@/lib/format';
import { readGear, type Gear, readRunTags, writeRunTags, type RunTag, type RunTagsFile } from '@/lib/gear';

/** Runs: the imported runs, the import with its progress, and the files that could not be imported. */
export default function RunsPageWrapper() {
  return <Suspense><RunsPage /></Suspense>;
}

function RunsPage() {
  const { folder, handle } = useOpenFolder();
  const router = useRouter();
  const params = useSearchParams();
  const actionDone = useRef(false);
  const [index, setIndex] = useState<RunsIndex | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [gear, setGear] = useState<Gear[]>([]);
  const [tags, setTags] = useState<RunTagsFile | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIndex(await readJson<RunsIndex>(folder, PATHS.runsIndex));
    setManifest(await readManifest(folder));
    setGear(await readGear(folder));
    setTags(await readRunTags(folder));
  }, [folder]);

  const saveTag = async (runId: string, tag: RunTag) => {
    if (!tags) return;
    await writeRunTags(folder, { ...tags, tags: { ...tags.tags, [runId]: tag } });
    await runInWorker('context', handle);
    setEditing(null);
    await load();
  };

  useEffect(() => {
    load();
  }, [load]);

  // A job started before this screen opened (or from another screen) keeps showing its progress,
  // and the list reloads when it ends.
  useEffect(() => {
    let was = false;
    return watchJob((j) => {
      if (j && (j.job === 'import' || j.job === 'recompute')) {
        was = true;
        setProgress({ done: j.done, total: j.total });
      } else if (was) {
        was = false;
        setProgress(null);
        load();
      }
    });
  }, [load]);

  // ⌘K → "Import folder" lands here with ?action=import.
  useEffect(() => {
    if (params.get('action') === 'import' && !actionDone.current) {
      actionDone.current = true;
      router.replace('/');
      start('import');
    }
  });

  const start = async (kind: 'import' | 'recompute') => {
    setMessage(null);
    setProgress({ done: 0, total: 0 });
    try {
      const m = await runInWorker(kind, handle, (p) => setProgress({ done: p.done, total: p.total }));
      setMessage(`${kind === 'recompute' ? 'Recomputed' : 'Imported'} ${m.imported} run${m.imported === 1 ? '' : 's'}` + (m.duplicates ? `, ${m.duplicates} duplicate` : '') + (m.errors ? `, ${m.errors} could not be imported` : '') + '.');
    } catch (e) {
      setMessage(`${kind === 'recompute' ? 'Recompute' : 'Import'} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    setProgress(null);
    load();
  };

  const runs = [...(index?.runs ?? [])].reverse();
  const failed = Object.entries(manifest?.files ?? {}).filter(([, s]) => s.status === 'error') as [string, { status: 'error'; reason: string }][];
  const totalKm = runs.reduce((a, r) => a + r.distance, 0) / 1000;
  const devices = [...new Set(runs.map((r) => r.device))];

  return (
    <div className="page">
      <div className="page-head">
        <h1>Runs</h1>
        <span className="spacer" />
        <button className="btn" onClick={() => confirm('Rebuild all derived data from the FIT files? Your gear, tags and block definitions stay as they are.') && start('recompute')} disabled={!!progress}>
          Recompute everything
        </button>
        <button className="btn primary" onClick={() => start('import')} disabled={!!progress}>
          {progress ? 'Working…' : 'Import folder'}
        </button>
      </div>

      {isOutdated(manifest) && (
        <div className="banner warn">
          ⚠ Data in this folder was built with algorithm v{manifest!.algorithmVersion}; this app is v{ALGORITHM_VERSION}.
          <span style={{ flex: 1 }} />
          <button className="btn primary" onClick={() => start('recompute')} disabled={!!progress}>Recompute</button>
        </div>
      )}
      {progress && (
        <div className="card" style={{ padding: '10px 14px', marginBottom: 14 }}>
          <span className="muted">Working in the background · {progress.done} / {progress.total || '…'} files</span>
          <div className="progress"><div style={{ width: progress.total ? `${(100 * progress.done) / progress.total}%` : '3%' }} /></div>
        </div>
      )}
      {message && <div className="banner">{message}</div>}

      {runs.length > 0 && (
        <div className="stats card">
          <div className="stat"><div className="v">{runs.length}</div><div className="l">runs</div></div>
          <div className="stat"><div className="v">{totalKm.toFixed(0)} km</div><div className="l">total distance</div></div>
          <div className="stat"><div className="v">{date(runs[runs.length - 1].startTime)}</div><div className="l">first run</div></div>
          <div className="stat"><div className="v">{devices.length}</div><div className="l">{devices.join(', ')}</div></div>
        </div>
      )}

      {failed.length > 0 && (
        <div className="banner err">
          <span>⚠ {failed.length} file{failed.length > 1 ? 's' : ''} could not be imported and will be tried again on the next import:</span>
          <span className="muted">{failed.map(([f, s]) => `${f.split('/').pop()} — ${s.reason}`).join(' · ')}</span>
        </div>
      )}

      <div className="card">
        {runs.length === 0 ? (
          <div className="empty">{index ? 'No runs yet.' : 'Nothing imported yet.'} Put your COROS FIT files in this folder (or its fit/ subfolder) and press <b>Import folder</b>.</div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Date</th><th>Start</th><th className="num">Distance km</th><th className="num">Time</th><th className="num">Pace /km</th><th className="num">Avg HR</th><th>HR from</th><th>Shoes</th><th>Tags</th><th className="num">Load 7 d</th><th />
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <Fragment key={r.id}>
                  <tr className="row" onClick={() => router.push(`/run?id=${r.id}`)}>
                    <td className="strong">{date(r.startTime)}</td>
                    <td className="muted">{time(r.startTime)}</td>
                    <td className="num">{km(r.distance)}</td>
                    <td className="num">{duration(r.duration)}</td>
                    <td className="num strong">{pace(r.avgSpeed)}</td>
                    <td className="num">{r.avgHeartRate ?? '–'}</td>
                    <td><span className="chip">{(r.heartRateSource ?? r.device).replace('COROS ', '')}</span></td>
                    <td>{r.shoes ? <span className="chip" title={r.shoesOverridden ? 'set for this run' : 'by date'}>{r.shoes}{r.shoesOverridden ? ' ✎' : ''}</span> : <span className="muted">–</span>}</td>
                    <td>
                      {[r.workoutType, r.techniqueCue].filter(Boolean).map((t) => <span key={t} className="chip" style={{ marginRight: 4 }}>{t}</span>)}
                      {r.note && <span className="muted" title={r.note}>✉</span>}
                    </td>
                    <td className="num muted">{r.load7 ? `${r.load7} min` : '–'}</td>
                    <td>
                      <button className="btn sm" onClick={(e) => { e.stopPropagation(); setEditing(editing === r.id ? null : r.id); }}>Edit</button>
                    </td>
                  </tr>
                  {editing === r.id && tags && (
                    <tr>
                      <td colSpan={11} style={{ background: 'var(--surface-2)' }}>
                        <TagEditor tag={tags.tags[r.id] ?? {}} gear={gear} dictionary={tags.dictionary} onSave={(t) => saveTag(r.id, t)} onCancel={() => setEditing(null)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function TagEditor({ tag, gear, dictionary, onSave, onCancel }: {
  tag: RunTag;
  gear: Gear[];
  dictionary: RunTagsFile['dictionary'];
  onSave: (t: RunTag) => void;
  onCancel: () => void;
}) {
  const [t, setT] = useState<RunTag>(tag);
  const set = (k: keyof RunTag, v: string) => setT({ ...t, [k]: v || undefined });
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '4px 0' }}>
      <label className="muted">Shoe override{' '}
        <select value={t.shoesOverride ?? ''} onChange={(e) => set('shoesOverride', e.target.value)}>
          <option value="">by date</option>
          {gear.filter((g) => g.type === 'shoes').map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </label>
      <label className="muted">Type{' '}
        <select value={t.workoutType ?? ''} onChange={(e) => set('workoutType', e.target.value)}>
          <option value="">–</option>
          {dictionary.workoutTypes.map((v) => <option key={v}>{v}</option>)}
        </select>
      </label>
      <label className="muted">Technique cue{' '}
        <select value={t.techniqueCue ?? ''} onChange={(e) => set('techniqueCue', e.target.value)}>
          <option value="">–</option>
          {dictionary.techniqueCues.map((v) => <option key={v}>{v}</option>)}
        </select>
      </label>
      <label className="muted">Note <input value={t.note ?? ''} onChange={(e) => set('note', e.target.value)} style={{ width: 200 }} /></label>
      <span style={{ flex: 1 }} />
      <button className="btn" onClick={onCancel}>Cancel</button>
      <button className="btn primary" onClick={() => onSave(t)}>Save</button>
    </div>
  );
}
