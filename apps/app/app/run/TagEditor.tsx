'use client';

import { useState } from 'react';
import { EditDialog } from '@/components';
import type { Gear, RunTag, RunTagsFile } from '@/lib/gear';
import { t } from '@/lib/i18n';

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
  const [draft, setDraft] = useState<RunTag>(tag);
  const set = (k: keyof RunTag, v: string) => setDraft({ ...draft, [k]: v || undefined });
  return (
    <EditDialog kind="run" kindLabel={t('Tags and note')} title={title} onSave={() => onSave(draft)} onCancel={onCancel}>
      <label className="edit-field">{t('Title')}<input className="input" value={draft.title ?? ''} placeholder={t('e.g. COROS test')} onChange={(e) => set('title', e.target.value)} /></label>
      <div className="edit-row">
        <label className="edit-field">{t('Type')}
          <select className="select" value={draft.workoutType ?? ''} onChange={(e) => set('workoutType', e.target.value)}>
            <option value="">–</option>
            {dictionary.workoutTypes.map((v) => <option key={v}>{v}</option>)}
          </select>
        </label>
        <label className="edit-field">{t('Technique cue')}
          <select className="select" value={draft.techniqueCue ?? ''} onChange={(e) => set('techniqueCue', e.target.value)}>
            <option value="">–</option>
            {dictionary.techniqueCues.map((v) => <option key={v}>{v}</option>)}
          </select>
        </label>
      </div>
      <label className="edit-field">{t('Shoes worn')}
        <select className="select" value={draft.shoesOverride ?? ''} onChange={(e) => set('shoesOverride', e.target.value)}>
          <option value="">{t('As by the date')}</option>
          {gear.filter((g) => g.type === 'shoes').map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </label>
      <label className="edit-field">{t('Note')}<textarea className="input" rows={3} value={draft.note ?? ''} onChange={(e) => set('note', e.target.value)} /></label>
    </EditDialog>
  );
}
