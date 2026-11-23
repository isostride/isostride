'use client';

import { useEffect, useMemo, useState } from 'react';
import { useOpenFolder } from '@/lib/client';
import { THRESHOLDS, THRESHOLD_FIELDS, thresholdValue } from '@/lib/load';
import { readSettings, writeSettings } from '@/lib/settings';

/** The texts as one key, the empty ones left out: equal keys, nothing changed. */
const key = (t: Record<string, string>) => JSON.stringify(Object.entries(t).filter(([, v]) => v.trim()).sort());

/** A stored value in the unit shown: a share as a percentage, to at most two decimals. */
const shown = (v: number, scale: number) => String(Math.round(v * scale * 100) / 100);

/**
 * The thresholds of the models' checks, set by the runner (the runner's "tak" to "Chcesz, żeby te
 * progi (np. 80 % biegów z pasem) dało się ustawiać w Settings?"; requirement "Thresholds of the
 * models"): each in its unit, its default beside it, empty for the default; saved in the data folder
 * with the performance model, so every "Why?" of Performance judges by them.
 */
export function ModelsCard() {
  const { folder } = useOpenFolder();
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  /** what is saved, to tell a change not saved yet: only then is there a Save */
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    readSettings(folder).then((s) => {
      const own = s.performance.thresholds;
      const t = Object.fromEntries(THRESHOLD_FIELDS.filter((f) => f.key in own).map((f) => [f.key, shown(own[f.key], f.scale)]));
      setTexts(t);
      setSaved(key(t));
    }).catch(() => undefined);
  }, [folder]);

  // Each text read back in its unit: empty is the default; out of range or not a number, wrong.
  const parsed = useMemo(() => THRESHOLD_FIELDS.map((f) => {
    const text = (texts[f.key] ?? '').trim().replace(',', '.');
    if (!text) return { f, value: null, bad: false };
    const n = Number(text);
    return Number.isFinite(n) && n >= f.min && n <= f.max ? { f, value: n / f.scale, bad: false } : { f, value: null, bad: true };
  }), [texts]);
  const bad = parsed.filter((p) => p.bad);
  const groups = [...new Set(THRESHOLD_FIELDS.map((f) => f.group))];

  const dirty = saved !== null && key(texts) !== saved;

  const save = async () => {
    if (bad.length) return;
    const s = await readSettings(folder);
    const thresholds = Object.fromEntries(parsed.filter((p) => p.value !== null).map((p) => [p.f.key, p.value!]));
    // The zones stay as they are: the defaults are not saved as the runner's own.
    await writeSettings(folder, { schemaVersion: 1, ...(s.defaults ? {} : { zones: s.zones }), performance: { ...s.performance, thresholds } });
    setSaved(key(texts));
    setStatus('Saved · Performance judges by these now');
  };

  return (
    <section className="card models-card form-card" aria-label="Thresholds of the checks">
      <div className="form-card-head">
        <div>
          <h2>Thresholds of the checks</h2>
          <p className="muted small">The thresholds by which every &quot;Why?&quot; of Performance judges a model&apos;s assumptions: holds, in doubt or not. Empty: the default, beside each. Kept in your data folder.</p>
        </div>
        <span className="spacer" />
        {Object.values(texts).some((v) => v.trim()) && <button type="button" className="btn" onClick={() => { setTexts({}); setStatus(null); }}>Defaults</button>}
        {dirty && <button type="button" className="btn primary" disabled={bad.length > 0} onClick={save}>Save</button>}
      </div>
      {status && <p className="muted small models-status" role="status">{status}</p>}
      {bad.length > 0 && <p className="small models-bad" role="alert">Out of range: {bad.map((b) => `${b.f.label} (${b.f.min}–${b.f.max})`).join('; ')}.</p>}
      {groups.map((g) => (
        <div key={g} className="form-section" role="group" aria-label={g}>
          <h3>{g}</h3>
          <div className="form-rows">
            {parsed.filter((p) => p.f.group === g).map(({ f, bad: wrong }) => (
              <label key={f.key} className="form-row">
                <span className="form-row-label"><span>{f.label}</span><small>default {shown(thresholdValue(THRESHOLDS, f.key), f.scale)} {f.unit}</small></span>
                <span className="form-row-input">
                  <input className="input" inputMode="decimal" aria-label={f.label} aria-invalid={wrong} value={texts[f.key] ?? ''}
                    placeholder={shown(thresholdValue(THRESHOLDS, f.key), f.scale)} onChange={(e) => { setTexts((t) => ({ ...t, [f.key]: e.target.value })); setStatus(null); }} />
                  <span className="muted small">{f.unit}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
