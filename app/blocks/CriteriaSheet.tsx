'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY_CRITERIA, criteriaName, definitionFromCriteria, isEmptyCriteria, lapSubject, matchesCriteria, runSubject, type BlockDefinition, type BlockStart, type Criteria, type CriteriaScope } from '@/lib/blocks';
import { useOpenFolder } from '@/lib/client';
import { PATHS, readJson } from '@/lib/fs';
import { date, km, pace as fmtPace } from '@/lib/format';
import { readGear, readRunTags } from '@/lib/gear';
import type { IndexedRun, RunFile, RunsIndex } from '@/lib/kernel';

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const parsePace = (text: string): number | null => {
  if (!text.trim()) return null;
  const [m, s] = text.split(':').map(Number);
  return Number.isFinite(m) ? m * 60 + (s || 0) : null;
};
const parseNum = (text: string, scale = 1): number | null => {
  if (!text.trim()) return null;
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) ? n * scale : null;
};

/** A from–to pair of inputs for one range criterion; the value is kept in the criteria's unit. */
function Range({ label, unit, from, to, show, parse, onChange }: {
  label: string; unit: string; from: number | null; to: number | null;
  show: (v: number) => string; parse: (text: string) => number | null; onChange: (from: number | null, to: number | null) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="range">
        <input aria-label={`${label} from`} placeholder="from" defaultValue={from === null ? '' : show(from)} onChange={(e) => onChange(parse(e.target.value), to)} />
        <span className="muted">–</span>
        <input aria-label={`${label} to`} placeholder="to" defaultValue={to === null ? '' : show(to)} onChange={(e) => onChange(from, parse(e.target.value))} />
        <span className="muted small unit">{unit}</span>
      </span>
    </label>
  );
}

/** Pills toggling the values of a list criterion; none chosen means any. */
function Picks({ label, options, chosen, onChange }: { label: string; options: string[]; chosen: string[]; onChange: (v: string[]) => void }) {
  if (!options.length) return null;
  return (
    <div className="field picks">
      <span>{label}</span>
      <span className="metric-picker" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o} type="button" className={`pill ${chosen.includes(o) ? 'on' : ''}`} aria-pressed={chosen.includes(o)} onClick={() => onChange(chosen.includes(o) ? chosen.filter((x) => x !== o) : [...chosen, o])}>{o}</button>
        ))}
      </span>
    </div>
  );
}

/**
 * The sheet a block from criteria is made or changed in: the criteria as fields, the runs (or
 * laps) that meet them counted and listed as the runner types, then Create.
 */
export function CriteriaSheet({ def, onClose, onSave, onDelete }: { def?: BlockDefinition; onClose: () => void; onSave: (d: BlockDefinition) => void; onDelete?: (d: BlockDefinition) => void }) {
  const { folder } = useOpenFolder();
  const given = def?.params.type === 'criteria' ? def.params : null;
  const [criteria, setCriteria] = useState<Criteria>(given?.criteria ?? EMPTY_CRITERIA);
  const [scope, setScope] = useState<CriteriaScope>(given?.scope ?? 'run');
  const [name, setName] = useState(def?.name ?? '');
  const [named, setNamed] = useState(!!def);
  const [hrSkip, setHrSkip] = useState<number | null>(def?.tolerances.hrSkip ?? null);
  const [start, setStart] = useState<BlockStart>(def?.tolerances.start ?? 'any');
  const [rows, setRows] = useState<IndexedRun[]>([]);
  const [options, setOptions] = useState({ workoutTypes: [] as string[], techniqueCues: [] as string[], shoes: [] as string[], heartRateSources: [] as string[], devices: [] as string[] });
  const [files, setFiles] = useState<Map<string, RunFile>>(new Map());
  const loading = useRef(false);

  useEffect(() => {
    (async () => {
      const runs = (await readJson<RunsIndex>(folder, PATHS.runsIndex))?.runs ?? [];
      const tags = await readRunTags(folder);
      const gear = await readGear(folder);
      const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
      setRows(runs);
      setOptions({
        workoutTypes: uniq([...tags.dictionary.workoutTypes, ...runs.map((r) => r.workoutType)]),
        techniqueCues: uniq([...tags.dictionary.techniqueCues, ...runs.map((r) => r.techniqueCue)]),
        shoes: uniq([...gear.filter((g) => g.type === 'shoes').map((g) => g.name), ...runs.map((r) => r.shoes)]),
        heartRateSources: uniq(runs.map((r) => r.heartRateSource)),
        devices: uniq(runs.map((r) => r.device)),
      });
    })();
  }, [folder]);

  // Laps live in the run files: read once, when laps are the scope.
  useEffect(() => {
    if (scope !== 'lap' || loading.current || !rows.length) return;
    loading.current = true;
    (async () => {
      const next = new Map<string, RunFile>();
      for (const r of rows) { const f = await readJson<RunFile>(folder, PATHS.runFile(r.id)); if (f) next.set(r.id, f); }
      setFiles(next);
    })();
  }, [scope, rows, folder]);

  const set = (patch: Partial<Criteria>) => setCriteria((c) => ({ ...c, ...patch }));
  const effectiveName = named ? name : criteriaName(criteria, scope);

  /** The runs that meet the criteria, with the laps that do when laps are the scope. */
  const matches = useMemo(() => {
    if (scope === 'run') return rows.filter((r) => matchesCriteria(criteria, runSubject(r))).map((r) => ({ row: r, laps: [] as number[] }));
    return rows.flatMap((r) => {
      const f = files.get(r.id);
      if (!f) return [];
      const laps = f.laps.map((_, i) => i).filter((i) => matchesCriteria(criteria, lapSubject(f, r, i)));
      return laps.length ? [{ row: r, laps }] : [];
    });
  }, [rows, files, criteria, scope]);
  const lapsTotal = matches.reduce((a, m) => a + m.laps.length, 0);
  const lapsPending = scope === 'lap' && files.size < rows.length;
  const empty = isEmptyCriteria(criteria);

  const save = () => {
    const base = def ?? definitionFromCriteria(effectiveName, criteria, scope);
    onSave({ ...base, name: effectiveName.trim() || criteriaName(criteria, scope), params: { type: 'criteria', criteria, scope }, tolerances: { ...base.tolerances, hrSkip, start } });
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <aside className="sheet wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={def ? 'Block from criteria' : 'New block from criteria'}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{def ? 'Block from criteria' : 'New block from criteria'}</h3>
          <span style={{ flex: 1 }} />
          <button className="btn icon" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>Every criterion set must hold; an empty one is not checked. The runs that meet them update as you type.</p>

        <label className="field"><span>Name</span><input value={effectiveName} aria-label="Name" onChange={(e) => { setName(e.target.value); setNamed(true); }} style={{ width: 260 }} /></label>
        <div className="field">
          <span>Instance</span>
          <div className="segmented" role="radiogroup" aria-label="Instance">
            <button type="button" role="radio" aria-checked={scope === 'run'} className={scope === 'run' ? 'on' : ''} onClick={() => setScope('run')}>Whole run</button>
            <button type="button" role="radio" aria-checked={scope === 'lap'} className={scope === 'lap' ? 'on' : ''} onClick={() => setScope('lap')}>Each lap that meets them</button>
          </div>
        </div>

        <label className="field"><span>Title contains</span><input aria-label="Title contains" placeholder="e.g. COROS test" value={criteria.title} onChange={(e) => set({ title: e.target.value })} style={{ width: 200 }} /></label>
        <Range label="Distance" unit="km" from={criteria.distanceMin} to={criteria.distanceMax} show={(v) => String(+(v / 1000).toFixed(2))} parse={(t) => parseNum(t, 1000)} onChange={(a, b) => set({ distanceMin: a, distanceMax: b })} />
        <Range label="Pace" unit="/km" from={criteria.paceMin} to={criteria.paceMax} show={mmss} parse={parsePace} onChange={(a, b) => set({ paceMin: a, paceMax: b })} />
        <Range label="Duration" unit="min" from={criteria.durationMin} to={criteria.durationMax} show={(v) => String(Math.round(v / 60))} parse={(t) => parseNum(t, 60)} onChange={(a, b) => set({ durationMin: a, durationMax: b })} />
        <Picks label="Workout type" options={options.workoutTypes} chosen={criteria.workoutTypes} onChange={(v) => set({ workoutTypes: v })} />
        <Picks label="Technique cue" options={options.techniqueCues} chosen={criteria.techniqueCues} onChange={(v) => set({ techniqueCues: v })} />
        <Picks label="Shoes" options={options.shoes} chosen={criteria.shoes} onChange={(v) => set({ shoes: v })} />
        <Picks label="Heart rate from" options={options.heartRateSources} chosen={criteria.heartRateSources} onChange={(v) => set({ heartRateSources: v })} />
        <Picks label="Watch" options={options.devices} chosen={criteria.devices} onChange={(v) => set({ devices: v })} />
        <label className="field">
          <span>Dates</span>
          <span className="range">
            <input type="date" aria-label="Dates from" value={criteria.dateFrom ?? ''} onChange={(e) => set({ dateFrom: e.target.value || null })} />
            <span className="muted">–</span>
            <input type="date" aria-label="Dates to" value={criteria.dateTo ?? ''} onChange={(e) => set({ dateTo: e.target.value || null })} />
          </span>
        </label>
        <Range label="Average heart rate" unit="bpm" from={criteria.heartRateMin} to={criteria.heartRateMax} show={String} parse={(t) => parseNum(t)} onChange={(a, b) => set({ heartRateMin: a, heartRateMax: b })} />
        <Range label="Laps in the run" unit="" from={criteria.lapsMin} to={criteria.lapsMax} show={String} parse={(t) => parseNum(t)} onChange={(a, b) => set({ lapsMin: a, lapsMax: b })} />

        <details className="measure">
          <summary className="muted small">Measurement of every instance</summary>
          <label className="field"><span>Heart rate from minute (empty: the whole instance)</span><input aria-label="Heart rate from minute" defaultValue={hrSkip === null ? '' : String(hrSkip / 60)} placeholder="–" onChange={(e) => setHrSkip(parseNum(e.target.value, 60))} style={{ width: 70 }} /></label>
          <label className="field">
            <span>Start of every instance</span>
            <select aria-label="Start of every instance" value={start} onChange={(e) => setStart(e.target.value as BlockStart)}>
              <option value="any">any</option>
              <option value="standing">standing (right after a stop)</option>
              <option value="flying">flying (on the move)</option>
            </select>
          </label>
        </details>

        <div className="preview" aria-live="polite">
          <div className="preview-count">
            {lapsPending ? `Reading laps… ${files.size} / ${rows.length} runs` : scope === 'lap' ? `${lapsTotal} lap${lapsTotal === 1 ? '' : 's'} in ${matches.length} run${matches.length === 1 ? '' : 's'} ${lapsTotal === 1 ? 'meets' : 'meet'} the criteria` : `${matches.length} run${matches.length === 1 ? '' : 's'} ${matches.length === 1 ? 'meets' : 'meet'} the criteria`}
            {empty && <span className="muted"> · set a criterion</span>}
          </div>
          <ul className="preview-list">
            {[...matches].reverse().slice(0, 8).map(({ row, laps }) => (
              <li key={row.id}><span>{date(row.startTime)}</span><span className="muted">{km(row.distance)} km · {fmtPace(row.avgSpeed)} /km{row.title ? ` · ${row.title}` : ''}{laps.length ? ` · lap${laps.length > 1 ? 's' : ''} ${laps.map((i) => i + 1).join(', ')}` : ''}</span></li>
            ))}
            {matches.length > 8 && <li className="muted">… and {matches.length - 8} more</li>}
          </ul>
        </div>
        <button className="btn primary" style={{ width: '100%', marginTop: 12 }} disabled={empty || !matches.length || lapsPending} onClick={save}>{def ? 'Save & re-detect' : 'Create block'}</button>
        {def && onDelete && <button className="btn danger" style={{ width: '100%', marginTop: 8 }} onClick={() => confirm(`Delete the block "${def.name}" and its detected instances?`) && onDelete(def)}>Delete block</button>}
      </aside>
    </div>
  );
}
