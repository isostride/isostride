'use client';

import { useState } from 'react';
import { EditDialog } from '@/components';
import type { Gear, RunTag, RunTagsFile } from '@/lib/gear';

/**
 * What the runner says about one run: its title, the shoes worn when not those of the date, the
 * workout type, the technique cue and a note; on the Runs list and on the Run screen ("dolozenie
 * tagu, notatki jest dostepne tylko z widoku listy runs"), in the app's one editor, a dialog in the
 * middle of the screen (ADR "One way to add, edit and delete"): nothing saved before Save.
 */
export function TagEditor({ title, tag, gear, dictionary, onSave, onCancel }: {
  /** the run's name, for the dialog's title */
  title: string;
  tag: RunTag;
  gear: Gear[];
  dictionary: RunTagsFile['dictionary'];
  onSave: (t: RunTag) => void;
  onCancel: () => void;
}) {
  const [t, setT] = useState<RunTag>(tag);
  const set = (k: keyof RunTag, v: string) => setT({ ...t, [k]: v || undefined });
  return (
    <EditDialog kind="run" kindLabel="Tags and note" title={title} onSave={() => onSave(t)} onCancel={onCancel}>
      <label className="edit-field">Title<input className="input" value={t.title ?? ''} placeholder="e.g. COROS test" onChange={(e) => set('title', e.target.value)} /></label>
      <div className="edit-row">
        <label className="edit-field">Type
          <select className="select" value={t.workoutType ?? ''} onChange={(e) => set('workoutType', e.target.value)}>
            <option value="">–</option>
            {dictionary.workoutTypes.map((v) => <option key={v}>{v}</option>)}
          </select>
        </label>
        <label className="edit-field">Technique cue
          <select className="select" value={t.techniqueCue ?? ''} onChange={(e) => set('techniqueCue', e.target.value)}>
            <option value="">–</option>
            {dictionary.techniqueCues.map((v) => <option key={v}>{v}</option>)}
          </select>
        </label>
      </div>
      <label className="edit-field">Shoes worn
        <select className="select" value={t.shoesOverride ?? ''} onChange={(e) => set('shoesOverride', e.target.value)}>
          <option value="">As by the date</option>
          {gear.filter((g) => g.type === 'shoes').map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </label>
      <label className="edit-field">Note<textarea className="input" rows={3} value={t.note ?? ''} onChange={(e) => set('note', e.target.value)} /></label>
    </EditDialog>
  );
}
