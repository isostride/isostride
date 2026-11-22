'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useConfirm } from '@/components';
import { SAVED_PARAM, analysisChanged, parseItems, defaultAnalysisName, removeAnalysis, upsertAnalysis, type SavedAnalysesFile, type SavedAnalysis } from '@/lib/compare';
import { date } from '@/lib/format';
import { PATHS, readJson, writeJson, type DataFolder } from '@/lib/fs';

/** The link of a saved analysis, with its id, so the screen knows which one is open. */
const linkOf = (a: SavedAnalysis) => `${a.query}${a.query ? '&' : ''}${SAVED_PARAM}=${encodeURIComponent(a.id)}`;

/**
 * The runner's saved analyses, in the head of Analysis (the runner's request of 22 Nov 2026:
 * "powinno byc puste .. ale chce miec mozliwosc zapisania analiz"; requirement "Saved analyses"):
 * a list to open one from, and Save analysis, which asks for a name in the app and keeps what the
 * screen shows (its segments and runs, metrics, tab) in the data folder; an open analysis is saved
 * again in place or as a new one, or deleted.
 */
export function SavedAnalyses({ folder, query, labels, hasItems, onOpen }: {
  folder: DataFolder;
  /** the screen's link now */
  query: string;
  /** the names of the items shown, for the name offered */
  labels: string[];
  hasItems: boolean;
  /** shows a link of Analysis */
  onOpen: (query: string) => void;
}) {
  const [list, setList] = useState<SavedAnalysis[]>([]);
  const [dialog, setDialog] = useState(false);
  const [confirmDialog, confirm] = useConfirm();
  const load = useCallback(async () => setList((await readJson<SavedAnalysesFile>(folder, PATHS.analyses))?.analyses ?? []), [folder]);
  useEffect(() => { load().catch(() => setList([])); }, [load]);

  const openId = new URLSearchParams(query).get(SAVED_PARAM);
  const current = list.find((a) => a.id === openId) ?? null;
  const changed = analysisChanged(current, query);

  const write = async (next: SavedAnalysis[]) => {
    await writeJson(folder, PATHS.analyses, { analyses: next } satisfies SavedAnalysesFile);
    setList(next);
  };
  const save = async (name: string, asNew: boolean) => {
    const { list: next, saved } = upsertAnalysis(list, { id: asNew ? undefined : current?.id, name, query });
    await write(next);
    setDialog(false);
    onOpen(linkOf(saved));
  };
  const remove = async () => {
    if (!current || !(await confirm({ title: 'Delete this analysis?', message: `“${current.name}” goes from your saved analyses. The segments and runs in it stay.`, confirm: 'Delete', danger: true }))) return;
    await write(removeAnalysis(list, current.id));
    setDialog(false);
    const q = new URLSearchParams(query);
    q.delete(SAVED_PARAM);
    onOpen(q.toString());
  };

  return (
    <div className="saved-analyses">
      {list.length > 0 && (
        <select className="select small" aria-label="Saved analyses" value={current?.id ?? ''} onChange={(e) => { const a = list.find((x) => x.id === e.target.value); if (a) onOpen(linkOf(a)); }}>
          <option value="" disabled>{current ? '' : 'Open a saved analysis…'}</option>
          {list.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      )}
      <button type="button" className="btn" disabled={!hasItems && !current} onClick={() => setDialog(true)}>
        {current ? (changed ? 'Save changes…' : 'Saved') : 'Save analysis'}
      </button>
      {dialog && <SaveDialog current={current} changed={changed} offered={current?.name ?? defaultAnalysisName(labels)} onSave={save} onDelete={remove} onClose={() => setDialog(false)} />}
      {confirmDialog}
    </div>
  );
}

/** The name of the analysis asked in the app: Save (in place, for the one open) or Save as new; Delete for the one open. */
function SaveDialog({ current, changed, offered, onSave, onDelete, onClose }: {
  current: SavedAnalysis | null; changed: boolean; offered: string;
  onSave: (name: string, asNew: boolean) => void; onDelete: () => void; onClose: () => void;
}) {
  const [name, setName] = useState(offered);
  const input = useRef<HTMLInputElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    input.current?.select();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  return (
    <div className="confirm-backdrop" onClick={onClose}>
      <form className="confirm-dialog" role="dialog" aria-modal="true" aria-label="Save analysis" onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); onSave(name, !current); }}>
        <h2>{current ? 'Save this analysis' : 'Save analysis'}</h2>
        <p>What is shown (its segments and runs, metrics and tab) is kept in your data folder under this name, to open again from the list.</p>
        <label className="field save-name"><span>Name</span><input ref={input} value={name} onChange={(e) => setName(e.target.value)} aria-label="Name of the analysis" /></label>
        <div className="confirm-actions">
          {current && <button type="button" className="btn danger" onClick={onDelete}>Delete</button>}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          {current && <button type="button" className="btn" onClick={() => onSave(name, true)}>Save as new</button>}
          <button type="submit" className="btn primary" disabled={!!current && !changed && name.trim() === current.name}>{current ? 'Save' : 'Save analysis'}</button>
        </div>
      </form>
    </div>
  );
}

/**
 * The saved analyses on the empty Analysis screen (the runner's request: "open saved analysis .. chce
 * aby ta lista pojawila sie na ekranie analysis po wejsciu"): each with what it holds and when it was
 * saved, opened with a click; nothing when none is saved.
 */
export function SavedList({ folder, onOpen }: { folder: DataFolder; onOpen: (query: string) => void }) {
  const [list, setList] = useState<SavedAnalysis[] | null>(null);
  const [confirmDialog, confirm] = useConfirm();
  useEffect(() => {
    readJson<SavedAnalysesFile>(folder, PATHS.analyses).then((f) => setList(f?.analyses ?? [])).catch(() => setList([]));
  }, [folder]);
  /** Deleted from its row ("a co z usuwaniem analiz?"), once confirmed in the app. */
  const remove = async (a: SavedAnalysis) => {
    if (!list || !(await confirm({ title: 'Delete this analysis?', message: `“${a.name}” goes from your saved analyses. The segments and runs in it stay.`, confirm: 'Delete', danger: true }))) return;
    const next = removeAnalysis(list, a.id);
    await writeJson(folder, PATHS.analyses, { analyses: next } satisfies SavedAnalysesFile);
    setList(next);
  };
  if (!list?.length) return confirmDialog ? <>{confirmDialog}</> : null;
  return (
    <section className="card saved-list" aria-label="Your saved analyses">
      <h2>Saved analyses <span className="muted">· {list.length}</span></h2>
      <ul>
        {list.map((a) => {
          const n = parseItems(new URLSearchParams(a.query).get('items')).length;
          return (
            <li key={a.id} className="saved-item">
              <button type="button" className="saved-row" onClick={() => onOpen(linkOf(a))}>
                <b>{a.name}</b>
                <span className="muted small">{n} item{n === 1 ? '' : 's'} · saved {date(a.savedAt)}</span>
                <span className="saved-open" aria-hidden="true">Open →</span>
              </button>
              <button type="button" className="btn sm danger" aria-label={`Delete ${a.name}`} onClick={() => remove(a)}>Delete</button>
            </li>
          );
        })}
      </ul>
      {confirmDialog}
    </section>
  );
}
