'use client';

import { useState } from 'react';
import { FOLDER_PATH_KEY, setValue } from '@/lib/client';
import { t } from '@/lib/i18n';

/**
 * Where the data folder is on the disk (the runner's "daj path do folderu", then "Ścieżka wpisana
 * raz"): a browser gives a web page only the folder's name, so the runner types its path once and
 * the app keeps it in this browser beside the folder's handle; choosing another folder forgets it.
 */
export function FolderPath({ name, initial }: { name: string; initial: string | null }) {
  const [path, setPath] = useState<string | null>(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const save = async (value: string | null) => {
    await setValue(FOLDER_PATH_KEY, value);
    setPath(value);
    setEditing(false);
  };
  const last = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop();

  if (path && !editing) {
    return (
      <>
        <b className="folder-path" title={path}>{path}</b>
        <span className="muted small">
          {t('FIT files in this folder or its fit/ subfolder')} · <button type="button" className="link-button" onClick={() => { setDraft(path); setEditing(true); }}>{t('Edit path')}</button>
        </span>
      </>
    );
  }
  return (
    <>
      <b>{name}</b>
      <form className="folder-path-form" onSubmit={(e) => { e.preventDefault(); const v = draft.trim(); if (v) void save(v); }}>
        <label className="muted small" htmlFor="folder-path">{t('Where is it on your disk?')}</label>
        <span className="folder-path-row">
          <input id="folder-path" className="input" placeholder={t('e.g. /Users/you/Runs/{name}', { name })} value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} autoComplete="off" />
          {editing && path && <button type="button" className="btn sm" onClick={() => void save(null)}>{t('Forget')}</button>}
          {editing && <button type="button" className="btn sm" onClick={() => (path ? setEditing(false) : undefined)}>{t('Cancel')}</button>}
          <button type="submit" className="btn sm primary" disabled={!draft.trim()}>{t('Save')}</button>
        </span>
        {draft.trim() && last(draft.trim()) !== name && <span className="small warn-text">{t('The path does not end in “{name}”, the folder chosen.', { name })}</span>}
        <span className="muted small">{t('Your browser gives a web page only the folder’s name. Type its path once to see it here; it is kept in this browser.')}</span>
      </form>
    </>
  );
}
