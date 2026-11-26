'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOpenFolder, runInWorker } from '@/lib/client';
import { newGearId, readGear, renameTag, writeGear, type Gear, type GearType, readRunTags, writeRunTags, type RunTagsFile, type TagKind } from '@/lib/gear';
import { readDefinitions, renameInDefinitions, writeDefinitions } from '@/lib/blocks';
import { PATHS, readJson } from '@/lib/fs';
import { EditButton, EditDialog, useConfirm } from '@/components';
import { msg, number, t, tn } from '@/lib/i18n';
import type { RunsIndex } from '@/lib/kernel';

/** The kinds of gear, as keys shown with t(). */
const TYPE_LABEL: Record<GearType, string> = { shoes: msg('Shoes'), hrSensor: msg('Heart rate sensor') };

/**
 * The Gears and Tags tabs of Settings (requirement "Settings in tabs"): the register of shoes and
 * heart rate sensors with their dates of use, or the tag dictionary. A piece of gear or a tag can be
 * renamed (requirement "Gear and tags renamed"): the segments' rules that name it follow. Added,
 * edited and deleted as everything kept in the folder is (ADR "One way to add, edit and delete"):
 * the list offers Edit, which opens the editor in the middle of the screen with Delete (asking first),
 * Cancel and Save.
 */
export function GearTags({ part }: { part: 'gear' | 'tags' }) {
  const { folder, handle } = useOpenFolder();
  const [gear, setGear] = useState<Gear[]>([]);
  const [tags, setTags] = useState<RunTagsFile | null>(null);
  const [index, setIndex] = useState<RunsIndex | null | undefined>(undefined);
  const [draft, setDraft] = useState<Omit<Gear, 'id'>>({ name: '', type: 'shoes', from: '', to: null });
  const [saved, setSaved] = useState<string | null>(null);
  /** the piece of gear being edited, with its fields as typed */
  const [editing, setEditing] = useState<Gear | null>(null);
  const [confirmDialog, confirm] = useConfirm();

  const load = useCallback(async () => {
    setGear(await readGear(folder));
    setTags(await readRunTags(folder));
    setIndex(await readJson<RunsIndex>(folder, PATHS.runsIndex));
  }, [folder]);
  useEffect(() => { load(); }, [load]);

  // Saves take their turn, and the list shows a save at once: the next one is built on it. Two pairs of
  // shoes or two tags added one after the other were each built on the list read before the first was
  // saved (its recompute still running), and the second wrote the first away.
  const turns = useRef<Promise<unknown>>(Promise.resolve());
  const waiting = useRef(0);
  const inTurn = (work: () => Promise<void>): Promise<void> => {
    waiting.current++;
    const turn = turns.current.then(work).finally(async () => { if (--waiting.current === 0) await load(); });
    turns.current = turn.catch(() => undefined);
    return turn;
  };

  const saveGear = (next: Gear[], what: string) => {
    setGear(next);
    return inTurn(async () => {
      const before = new Map(((await readJson<RunsIndex>(folder, PATHS.runsIndex))?.runs ?? []).map((r) => [r.id, `${r.shoesId}|${r.hrSensorId}`]));
      await writeGear(folder, next);
      await runInWorker('context', handle);
      const after = await readJson<RunsIndex>(folder, PATHS.runsIndex);
      const changed = (after?.runs ?? []).filter((r) => before.get(r.id) !== `${r.shoesId}|${r.hrSensorId}`).length;
      setSaved(`${what} · ${tn(changed, '{n} run reassigned', '{n} runs reassigned')}`);
    });
  };

  const saveTags = (next: RunTagsFile) => {
    setTags(next);
    return inTurn(async () => {
      await writeRunTags(folder, next);
      await runInWorker('context', handle);
    });
  };

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of index?.runs ?? []) {
      for (const k of [r.shoesId, r.hrSensorId, r.workoutType, r.techniqueCue]) if (k) c.set(k, (c.get(k) ?? 0) + 1);
    }
    return c;
  }, [index]);

  const runs = index?.runs ?? [];
  const first = runs[0]?.startTime.slice(0, 10) ?? '2026-01-01';
  const last = runs[runs.length - 1]?.startTime.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const t0 = new Date(first).getTime();
  const t1 = Math.max(new Date(last).getTime(), t0 + 86400000);
  const pos = (d: string) => Math.min(100, Math.max(0, ((new Date(d).getTime() - t0) / (t1 - t0)) * 100));

  const add = () => {
    if (!draft.name || !draft.from) return;
    saveGear([...gear, { ...draft, id: newGearId() }], t('Added {name}', { name: draft.name }));
    setDraft({ name: '', type: draft.type, from: '', to: null });
  };
  /** The rules of the segments that name what is renamed follow it. */
  const renameInRules = async (field: 'workoutTypes' | 'techniqueCues' | 'shoes' | 'heartRateSources', from: string, to: string) => {
    const defs = await readDefinitions(folder);
    const next = renameInDefinitions(defs, field, from, to);
    if (next.some((d, i) => d !== defs[i])) await writeDefinitions(folder, next);
  };
  /** The piece of gear edited saved: its name (the rules naming it follow) and its dates. */
  const saveEdit = async () => {
    if (!editing) return;
    const g = gear.find((x) => x.id === editing.id);
    const name = editing.name.trim();
    if (!g || !name || !editing.from) return;
    setEditing(null);
    if (name !== g.name) await renameInRules(g.type === 'shoes' ? 'shoes' : 'heartRateSources', g.name, name);
    await saveGear(gear.map((x) => (x.id === g.id ? { ...editing, name } : x)), name !== g.name ? t('Renamed {from} to {to}', { from: g.name, to: name }) : t('Updated {name}', { name: g.name }));
  };
  const renameTagTo = async (kind: TagKind, from: string, to: string) => {
    if (!tags) return;
    const next = renameTag(tags, kind, from, to);
    if (next === tags) return;
    await renameInRules(kind, from, to.trim());
    await saveTags(next);
    setSaved(t('Renamed {from} to {to}', { from, to: to.trim() }));
  };
  const remove = async (g: Gear) => {
    const n = counts.get(g.id) ?? 0;
    if (!(await confirm({ title: t('Delete this gear?'), message: tn(n, '“{name}” goes from your gear; its {n} run no longer carry it.', '“{name}” goes from your gear; its {n} runs no longer carry it.', { name: g.name }), confirm: t('Delete'), danger: true }))) return;
    setEditing(null);
    await saveGear(gear.filter((x) => x.id !== g.id), t('Deleted {name}', { name: g.name }));
  };
  const removeTag = async (kind: TagKind, v: string) => {
    if (!tags) return;
    const n = counts.get(v) ?? 0;
    const goes = kind === 'workoutTypes' ? t('“{name}” goes from the workout types to choose from.', { name: v }) : t('“{name}” goes from the technique cues to choose from.', { name: v });
    const kept = n ? tn(n, 'The {n} run tagged with it keep it until you change them.', 'The {n} runs tagged with it keep it until you change them.') : t('No run is tagged with it.');
    if (!(await confirm({ title: t('Delete this tag?'), message: `${goes} ${kept}`, confirm: t('Delete'), danger: true }))) return;
    await saveTags({ ...tags, dictionary: { ...tags.dictionary, [kind]: tags.dictionary[kind].filter((x) => x !== v) } });
    setSaved(t('Deleted {name}', { name: v }));
  };

  return (
    <>
      {confirmDialog}
      {saved && <div className="banner">✓ {saved}</div>}

      {/* Drawn once the runs are read: the time line of the gear spans their dates, not a guess first (layout shift 0). */}
      {part === 'gear' && index !== undefined && <div className="card gear-card" role="region" aria-label={t('Gears')}>
        <h3 className="gear-title">{t('Gears')}</h3>
        <div className="gear-row gear-span muted">
          <span />
          <div><span>{first}</span><span>{last}</span></div>
        </div>
        {gear.length === 0 && <div className="muted" style={{ padding: '8px 0 16px' }}>{t('No gear yet. Add your shoes and heart rate sensors with the dates you used them; runs get them by date.')}</div>}
        {gear.map((g) => (
          <div key={g.id} className="gear-row">
            <div>
              {/* The name as text, wrapped when long ("nazwa sie nie miesci"). */}
              <div className="gear-name-row"><span aria-hidden="true">{g.type === 'shoes' ? '👟' : '♥'}</span><span className="gear-name-text">{g.name}</span></div>
              <div className="muted" style={{ fontSize: 12 }}>{tn(counts.get(g.id) ?? 0, '{n} run', '{n} runs')}</div>
            </div>
            <div>
              <div style={{ position: 'relative', height: 14, background: 'var(--surface-2)', borderRadius: 7 }}>
                <div style={{ position: 'absolute', left: `${pos(g.from)}%`, right: `${100 - pos(g.to ?? last)}%`, top: 0, bottom: 0, borderRadius: 7, background: g.type === 'shoes' ? 'var(--series-1)' : 'var(--err)', opacity: 0.85 }} />
              </div>
              <div className="gear-dates">
                <span className="muted small">{g.to ? t('from {from} to {to}', { from: g.from, to: g.to }) : t('from {from}', { from: g.from })}</span>
                {g.to === null && <span className="chip">{t('in use')}</span>}
                <span style={{ flex: 1 }} />
                <EditButton name={g.name} onClick={() => setEditing({ ...g })} />
              </div>
            </div>
          </div>
        ))}
        <form className="gear-add" aria-label={t('Add gear')} onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input className="input" aria-label={t('Gear name')} placeholder={t('Name, e.g. Shoes A')} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <select className="select" aria-label={t('Gear type')} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as GearType })}>
            {(Object.keys(TYPE_LABEL) as GearType[]).map((type) => <option key={type} value={type}>{t(TYPE_LABEL[type])}</option>)}
          </select>
          <label className="muted">{t('from')} <input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></label>
          <label className="muted">{t('to')} <input type="date" value={draft.to ?? ''} onChange={(e) => setDraft({ ...draft, to: e.target.value || null })} /></label>
          <button type="submit" className="btn primary" disabled={!draft.name || !draft.from}>{t('Add gear')}</button>
        </form>
      </div>}
      {part === 'gear' && editing && (() => {
        const g = gear.find((x) => x.id === editing.id)!;
        return (
          <EditDialog kind="gear" kindLabel={t(TYPE_LABEL[g.type])} title={g.name} onSave={() => void saveEdit()} onCancel={() => setEditing(null)} onDelete={() => void remove(g)} canSave={!!editing.name.trim() && !!editing.from}>
            <label className="edit-field">{t('Name')}<input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
            <span className="edit-hint">{tn(counts.get(g.id) ?? 0, '{n} run by its dates. Runs get the gear in use on their day.', '{n} runs by its dates. Runs get the gear in use on their day.')}</span>
            <div className="edit-row">
              <label className="edit-field">{t('In use from')}<input className="input" type="date" value={editing.from} onChange={(e) => setEditing({ ...editing, from: e.target.value })} /></label>
              <label className="edit-field">{t('To (empty: in use)')}<input className="input" type="date" value={editing.to ?? ''} onChange={(e) => setEditing({ ...editing, to: e.target.value || null })} /></label>
            </div>
          </EditDialog>
        );
      })()}

      {part === 'tags' && tags && (
        <div className="card gear-card" role="region" aria-label={t('Tags')}>
          <h3 className="gear-title">{t('Tags')}</h3>
          <TagList label={t('Workout type')} newLabel={t('New workout type')} values={tags.dictionary.workoutTypes} counts={counts}
            onAdd={(v) => saveTags({ ...tags, dictionary: { ...tags.dictionary, workoutTypes: [...tags.dictionary.workoutTypes, v] } })} onRename={(from, to) => renameTagTo('workoutTypes', from, to)} onDelete={(v) => void removeTag('workoutTypes', v)} />
          <TagList label={t('Technique cue')} newLabel={t('New technique cue')} values={tags.dictionary.techniqueCues} counts={counts}
            onAdd={(v) => saveTags({ ...tags, dictionary: { ...tags.dictionary, techniqueCues: [...tags.dictionary.techniqueCues, v] } })} onRename={(from, to) => renameTagTo('techniqueCues', from, to)} onDelete={(v) => void removeTag('techniqueCues', v)} />
        </div>
      )}
    </>
  );
}

/**
 * A list of tags as chips: ✎ opens its editor in the middle of the screen, its name kept with Save or
 * Enter, left with Cancel or Esc, the tag deleted with Delete after asking (deleting is in the editor,
 * as for every list: "w samym edit jest usuwanie"); a name added with Add or Enter.
 */
function TagList({ label, newLabel, values, counts, onAdd, onRename, onDelete }: { label: string; newLabel: string; values: string[]; counts: Map<string, number>; onAdd: (v: string) => void; onRename: (from: string, to: string) => void; onDelete: (v: string) => void }) {
  const [text, setText] = useState('');
  /** the tag being renamed, and its new name as typed */
  const [editing, setEditing] = useState<{ from: string; to: string } | null>(null);
  const taken = (name: string) => name.trim() !== editing?.from && values.includes(name.trim());
  const save = () => { if (editing && editing.to.trim() && !taken(editing.to)) onRename(editing.from, editing.to); setEditing(null); };
  const adding = text.trim() && !values.includes(text.trim());
  const add = () => { if (adding) { onAdd(text.trim()); setText(''); } };
  return (
    <div className="tag-row" role="group" aria-label={label}>
      <span className="tag-label muted">{label}</span>
      {editing && (
        <EditDialog kind="tag" kindLabel={label} title={editing.from} onSave={save} onCancel={() => setEditing(null)} onDelete={() => { const v = editing.from; setEditing(null); onDelete(v); }} canSave={!!editing.to.trim() && !taken(editing.to)}>
          <label className="edit-field">{t('Name')}<input className="input" value={editing.to} aria-invalid={taken(editing.to)} onChange={(e) => setEditing({ ...editing, to: e.target.value })} /></label>
          {taken(editing.to) ? <span className="edit-hint zone-err">{t('{list} has “{name}” already.', { list: label, name: editing.to.trim() })}</span>
            : <span className="edit-hint">{t('Runs tagged with it, and segments whose rules name it, take the new name.')}</span>}
        </EditDialog>
      )}
      {values.map((v) => (
        <span key={v} className="chip">
          {v} · {number(counts.get(v) ?? 0)}{' '}
          <EditButton small name={v} onClick={() => setEditing({ from: v, to: v })} />
        </span>
      ))}
      <form className="tag-new" aria-label={t('Add to {list}', { list: label })} onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input aria-label={newLabel} placeholder={t('New tag')} value={text} onChange={(e) => setText(e.target.value)} className="tag-add" />
        <button type="submit" className="btn sm" disabled={!adding}>{t('Add')}</button>
      </form>
    </div>
  );
}
