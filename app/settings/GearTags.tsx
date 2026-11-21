'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOpenFolder, runInWorker } from '@/lib/client';
import { newGearId, readGear, writeGear, type Gear, type GearType, readRunTags, writeRunTags, type RunTagsFile } from '@/lib/gear';
import { PATHS, readJson } from '@/lib/fs';
import type { RunsIndex } from '@/lib/kernel';

const TYPE_LABEL: Record<GearType, string> = { shoes: 'Shoes', hrSensor: 'Heart rate sensor' };

/**
 * The Gear and Tags tabs of Settings (requirement "Settings in tabs"): the register of shoes and
 * heart rate sensors with their dates of use, or the tag dictionary.
 */
export function GearTags({ part }: { part: 'gear' | 'tags' }) {
  const { folder, handle } = useOpenFolder();
  const [gear, setGear] = useState<Gear[]>([]);
  const [tags, setTags] = useState<RunTagsFile | null>(null);
  const [index, setIndex] = useState<RunsIndex | null>(null);
  const [draft, setDraft] = useState<Omit<Gear, 'id'>>({ name: '', type: 'shoes', from: '', to: null });
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    setGear(await readGear(folder));
    setTags(await readRunTags(folder));
    setIndex(await readJson<RunsIndex>(folder, PATHS.runsIndex));
  }, [folder]);
  useEffect(() => { load(); }, [load]);

  const saveGear = async (next: Gear[], what: string) => {
    const before = new Map((index?.runs ?? []).map((r) => [r.id, `${r.shoesId}|${r.hrSensorId}`]));
    await writeGear(folder, next);
    await runInWorker('context', handle);
    const after = await readJson<RunsIndex>(folder, PATHS.runsIndex);
    const changed = (after?.runs ?? []).filter((r) => before.get(r.id) !== `${r.shoesId}|${r.hrSensorId}`).length;
    setSaved(`${what} · ${changed} run${changed === 1 ? '' : 's'} reassigned`);
    await load();
  };

  const saveTags = async (next: RunTagsFile) => {
    await writeRunTags(folder, next);
    await runInWorker('context', handle);
    await load();
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
    saveGear([...gear, { ...draft, id: newGearId() }], `Added ${draft.name}`);
    setDraft({ name: '', type: draft.type, from: '', to: null });
  };
  const update = (g: Gear, patch: Partial<Gear>) => saveGear(gear.map((x) => (x.id === g.id ? { ...x, ...patch } : x)), `Updated ${g.name}`);
  const remove = (g: Gear) => saveGear(gear.filter((x) => x.id !== g.id), `Removed ${g.name}`);

  return (
    <>
      {saved && <div className="banner">✓ {saved}</div>}

      {part === 'gear' && <div className="card" style={{ padding: 16, marginBottom: 16 }} role="region" aria-label="Gear">
        <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Gear</h3>
        <div className="muted" style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', margin: '0 0 6px 200px' }}>
          <span>{first}</span><span>{last}</span>
        </div>
        {gear.length === 0 && <div className="muted" style={{ padding: '8px 0 16px' }}>No gear yet. Add your shoes and heart rate sensors with the dates you used them; runs get them by date.</div>}
        {gear.map((g) => (
          <div key={g.id} style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 550 }}>{g.type === 'shoes' ? '👟' : '♥'} {g.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>{counts.get(g.id) ?? 0} runs</div>
            </div>
            <div>
              <div style={{ position: 'relative', height: 14, background: 'var(--surface-2)', borderRadius: 7 }}>
                <div style={{ position: 'absolute', left: `${pos(g.from)}%`, right: `${100 - pos(g.to ?? last)}%`, top: 0, bottom: 0, borderRadius: 7, background: g.type === 'shoes' ? 'var(--series-1)' : 'var(--err)', opacity: 0.85 }} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', fontSize: 12 }}>
                <label className="muted">from <input type="date" value={g.from} onChange={(e) => e.target.value && update(g, { from: e.target.value })} /></label>
                <label className="muted">to <input type="date" value={g.to ?? ''} onChange={(e) => update(g, { to: e.target.value || null })} /></label>
                {g.to === null && <span className="chip">in use</span>}
                <span style={{ flex: 1 }} />
                <button className="btn sm" onClick={() => remove(g)}>Remove</button>
              </div>
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <input aria-label="Gear name" placeholder="Name, e.g. Shoes A" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={{ padding: 6, minWidth: 180 }} />
          <select aria-label="Gear type" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as GearType })} style={{ padding: 6 }}>
            {(Object.keys(TYPE_LABEL) as GearType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
          <label className="muted">from <input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></label>
          <label className="muted">to <input type="date" value={draft.to ?? ''} onChange={(e) => setDraft({ ...draft, to: e.target.value || null })} /></label>
          <button className="btn primary" onClick={add} disabled={!draft.name || !draft.from}>Add gear</button>
        </div>
      </div>}

      {part === 'tags' && tags && (
        <div className="card" style={{ padding: 16 }} role="region" aria-label="Tags">
          <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Tags</h3>
          <TagList label="Workout type" values={tags.dictionary.workoutTypes} counts={counts}
            onChange={(v) => saveTags({ ...tags, dictionary: { ...tags.dictionary, workoutTypes: v } })} />
          <TagList label="Technique cue" values={tags.dictionary.techniqueCues} counts={counts}
            onChange={(v) => saveTags({ ...tags, dictionary: { ...tags.dictionary, techniqueCues: v } })} />
        </div>
      )}
    </>
  );
}

function TagList({ label, values, counts, onChange }: { label: string; values: string[]; counts: Map<string, number>; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('');
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
      <span style={{ width: 120 }} className="muted">{label}</span>
      {values.map((v) => (
        <span key={v} className="chip">
          {v} · {counts.get(v) ?? 0}{' '}
          <button style={{ border: 0, background: 'none', padding: 0, color: 'var(--muted)' }} onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}>×</button>
        </span>
      ))}
      <input aria-label={`Add to ${label}`} placeholder="+ add" value={text} onChange={(e) => setText(e.target.value)} style={{ padding: 4, width: 120 }}
        onKeyDown={(e) => { if (e.key === 'Enter' && text.trim() && !values.includes(text.trim())) { onChange([...values, text.trim()]); setText(''); } }} />
    </div>
  );
}
