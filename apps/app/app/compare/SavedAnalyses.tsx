'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { EditButton, EditDialog, useConfirm, useFocusTrap } from '@/components';
import { SAVED_PARAM, analysisChanged, parseItems, defaultAnalysisName, removeAnalysis, upsertAnalysis, type SavedAnalysesFile, type SavedAnalysis } from '@/lib/compare';
import { date } from '@/lib/format';
import { PATHS, readJson, writeJson, type DataFolder } from '@/lib/fs';
import { number, t } from '@/lib/i18n';

/** The link of a saved analysis, with its id, so the screen knows which one is open. */
const linkOf = (a: SavedAnalysis) => `${a.query}${a.query ? '&' : ''}${SAVED_PARAM}=${encodeURIComponent(a.id)}`;

/**
 * The runner's saved analyses, in the head of Analysis (the runner's request of 22 Nov 2026:
 * "powinno byc puste .. ale chce miec mozliwosc zapisania analiz"; requirement "Saved analyses"):
 * Save analysis, which asks for a name in the app and keeps what the
 * screen shows (its segments and runs, metrics, tab) in the data folder; an open analysis is saved
 * again in place or as a new one, or deleted.
 */
/**
 * Changes the saved analyses as the file holds them now, and writes them: the bar above the tabs and the
 * list on the empty screen each kept the list they read when they opened, and each wrote its own back
 * whole, so an analysis deleted or renamed in the list came back with the next save (the review of 26 Nov 2026).
 */
async function changeAnalyses(folder: DataFolder, change: (now: SavedAnalysis[]) => SavedAnalysis[]): Promise<SavedAnalysis[]> {
  const next = change((await readJson<SavedAnalysesFile>(folder, PATHS.analyses))?.analyses ?? []);
  await writeJson(folder, PATHS.analyses, { analyses: next } satisfies SavedAnalysesFile);
  return next;
}

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

  const save = async (name: string, asNew: boolean) => {
    let saved: SavedAnalysis | null = null;
    setList(await changeAnalyses(folder, (now) => { const r = upsertAnalysis(now, { id: asNew ? undefined : current?.id, name, query }); saved = r.saved; return r.list; }));
    setDialog(false);
    if (saved) onOpen(linkOf(saved));
  };
  const remove = async () => {
    if (!current || !(await confirm({ title: t('Delete this analysis?'), message: t('“{name}” goes from your saved analyses. The segments and runs in it stay.', { name: current.name }), confirm: t('Delete'), danger: true }))) return;
    setList(await changeAnalyses(folder, (now) => removeAnalysis(now, current.id)));
    setDialog(false);
    const q = new URLSearchParams(query);
    q.delete(SAVED_PARAM);
    onOpen(q.toString());
  };

  return (
    <div className="saved-analyses">
      {/* No list to open one from here ("nie ma chyba sensu"): the saved analyses are listed on the empty screen, each opened by its row. */}
      {/* Nothing to save, no button (a disabled one is only noise on the empty screen). */}
      {(hasItems || current) && <button type="button" className="btn" onClick={() => setDialog(true)}>
        {current ? (changed ? t('Save changes…') : t('Saved')) : t('Save analysis')}
      </button>}
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
  const box = useRef<HTMLFormElement>(null);
  useFocusTrap(box);
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
      <form ref={box} className="confirm-dialog" role="dialog" aria-modal="true" aria-label={t('Save analysis')} onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); onSave(name, !current); }}>
        <h2>{current ? t('Save this analysis') : t('Save analysis')}</h2>
        <p>{t('What is shown (its segments and runs, metrics and tab) is kept in your data folder under this name, to open again from the list.')}</p>
        <label className="field save-name"><span>{t('Name')}</span><input ref={input} value={name} onChange={(e) => setName(e.target.value)} aria-label={t('Name of the analysis')} /></label>
        <div className="confirm-actions">
          {current && <button type="button" className="btn danger" onClick={onDelete}>{t('Delete')}</button>}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button>
          {current && <button type="button" className="btn" onClick={() => onSave(name, true)}>{t('Save as new')}</button>}
          <button type="submit" className="btn primary" disabled={!!current && !changed && name.trim() === current.name}>{current ? t('Save') : t('Save analysis')}</button>
        </div>
      </form>
    </div>
  );
}

/**
 * The saved analyses on the empty Analysis screen (the runner's request: "open saved analysis .. chce
 * aby ta lista pojawila sie na ekranie analysis po wejsciu"): each with what it holds and when it was
 * saved, opened by a click on its row ("przycisk open sa bezsensu ... poprostu klikam na wiersz"), with
 * Edit ("jak zapisze to chce open oraz edit"; ADR "One way to add, edit and delete"), which renames it
 * in its dialog or deletes it after asking; nothing when none is saved.
 */
export function SavedList({ folder, onOpen, empty }: { folder: DataFolder; onOpen: (query: string) => void; /** shown once read when none is saved */ empty?: ReactNode }) {
  const [list, setList] = useState<SavedAnalysis[] | null>(null);
  /** the analysis being edited, with its name as typed */
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirmDialog, confirm] = useConfirm();
  useEffect(() => {
    readJson<SavedAnalysesFile>(folder, PATHS.analyses).then((f) => setList(f?.analyses ?? [])).catch(() => setList([]));
  }, [folder]);
  /** Renamed: the name typed, what it holds as it was. */
  const rename = async () => {
    const name = editing?.name.trim();
    if (!list || !editing || !name) return;
    setEditing(null);
    setList(await changeAnalyses(folder, (now) => now.map((x) => (x.id === editing.id ? { ...x, name } : x))));
  };
  /** Deleted from its editor ("a co z usuwaniem analiz?"), once confirmed in the app. */
  const remove = async (a: SavedAnalysis) => {
    if (!list || !(await confirm({ title: t('Delete this analysis?'), message: t('“{name}” goes from your saved analyses. The segments and runs in it stay.', { name: a.name }), confirm: t('Delete'), danger: true }))) return;
    setEditing(null);
    setList(await changeAnalyses(folder, (now) => removeAnalysis(now, a.id)));
  };
  if (!list?.length) return <>{list && empty}{confirmDialog}</>;
  return (
    // A table of the app's own: a head, a row for each, the name opening it ("jakis header ? kiepsko wyglada ta tabela").
    <section className="card saved-list" aria-label={t('Your saved analyses')}>
      <h2 className="chart-title">{t('Saved analyses')} <span className="muted">· {list.length}</span></h2>
      <table className="data saved-table" aria-label={t('Saved analyses')}>
        <thead><tr><th>{t('Analysis')}</th><th className="num">{t('Segments and runs')}</th><th className="num">{t('Saved')}</th><th><span className="sr-only">{t('Edit')}</span></th></tr></thead>
        <tbody>
          {list.map((a) => (
            // The whole row opens it, as on the Segments screen ("klikanie na calym wierszu powinno otwierac"); Edit only edits.
            <tr key={a.id} className="row saved-item" onClick={() => onOpen(linkOf(a))}>
              <td><button type="button" className="saved-row" aria-label={t('Open {name}', { name: a.name })} onClick={(e) => { e.stopPropagation(); onOpen(linkOf(a)); }}>{a.name}</button></td>
              <td className="num tnum">{number(parseItems(new URLSearchParams(a.query).get('items')).length)}</td>
              <td className="num tnum muted">{date(a.savedAt)}</td>
              <td className="row-actions" onClick={(e) => e.stopPropagation()}><EditButton name={a.name} onClick={() => setEditing({ id: a.id, name: a.name })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (() => {
        const a = list.find((x) => x.id === editing.id)!;
        return (
          <EditDialog kind="analysis" kindLabel={t('Saved analysis')} title={a.name} onSave={() => void rename()} onCancel={() => setEditing(null)} onDelete={() => void remove(a)} canSave={!!editing.name.trim()}>
            <label className="edit-field">{t('Name')}<input className="input" value={editing.name} onChange={(e) => setEditing({ id: a.id, name: e.target.value })} /></label>
          </EditDialog>
        );
      })()}
      {confirmDialog}
    </section>
  );
}
