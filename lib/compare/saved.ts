/**
 * Saved analyses (the runner's request of 22 Nov 2026: "powinno byc puste .. ale chce miec
 * mozliwosc zapisania analiz"; requirement "Saved analyses"): Analysis opens empty, and what it
 * shows (its segments and runs, metrics, tab and curve, as its link carries them) can be kept under a
 * name and opened again. Kept in the data folder, user/analyses.json, beside the segments.
 */

export interface SavedAnalysis {
  id: string;
  name: string;
  /** the link of Analysis, without the saved analysis' own id: items=…&m=…&tab=… */
  query: string;
  /** ISO time of the last save */
  savedAt: string;
}

export interface SavedAnalysesFile {
  analyses: SavedAnalysis[];
}

/** The link parameter naming the saved analysis that is open. */
export const SAVED_PARAM = 'a';

/** What of a link a saved analysis keeps: everything but the id of the analysis open and a one-off block link (def=). */
export function analysisQuery(query: string): string {
  const q = new URLSearchParams(query);
  q.delete(SAVED_PARAM);
  q.delete('def');
  return q.toString();
}

/** The name a new analysis is offered: its items' names joined, or "Analysis" with none. */
export function defaultAnalysisName(labels: string[]): string {
  const named = labels.filter((l) => l.trim());
  if (!named.length) return 'Analysis';
  const text = named.join(' + ');
  return text.length > 60 ? `${text.slice(0, 59).trimEnd()}…` : text;
}

/**
 * Keeps an analysis: the one with `id` changed in place (its name and link), or a new one at the
 * top. A name already used by another analysis gets " (2)", " (3)"… so the list tells them apart.
 */
export function upsertAnalysis(list: SavedAnalysis[], a: { id?: string; name: string; query: string }, now = new Date()): { list: SavedAnalysis[]; saved: SavedAnalysis } {
  const base = a.name.trim() || 'Analysis';
  const taken = new Set(list.filter((x) => x.id !== a.id).map((x) => x.name));
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base} (${n})`;
  const saved: SavedAnalysis = { id: a.id ?? `an-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name, query: analysisQuery(a.query), savedAt: now.toISOString() };
  const at = a.id ? list.findIndex((x) => x.id === a.id) : -1;
  return { list: at >= 0 ? list.map((x, i) => (i === at ? saved : x)) : [saved, ...list], saved };
}

export function removeAnalysis(list: SavedAnalysis[], id: string): SavedAnalysis[] {
  return list.filter((x) => x.id !== id);
}

/** True when the link shown differs from what the analysis keeps: there is something to save. */
export function analysisChanged(saved: SavedAnalysis | null, query: string): boolean {
  return !saved || saved.query !== analysisQuery(query);
}
