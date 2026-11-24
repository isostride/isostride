import { PATHS, readJson, writeJson, type DataFolder } from './folder';

/**
 * The runs an import added that the runner has not looked at yet (requirement "New runs marked new"),
 * kept in user/new-runs.json: marked New on the Runs screen until the run is opened, all are marked
 * as seen, or 7 days have passed since the import ("Do otwarcia, najdłużej 7 dni"). Kept in the
 * folder, so another browser on it sees them too.
 */
interface NewRunsFile {
  runs: string[];
  /** when each run was marked, ISO (files of before 24 Nov 2026 have none: a run's id gives its start) */
  marked?: Record<string, string>;
}

/** How long a run stays new without being opened, ms. */
export const NEW_FOR_MS = 7 * 86400 * 1000;

/** When a run was marked: as kept, else its start, which its id gives (yyyymmdd-hhmmss, UTC). */
function markedAt(file: NewRunsFile, id: string): number {
  const kept = file.marked?.[id];
  if (kept) return Date.parse(kept);
  const m = id.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : Date.now();
}

async function readFile(folder: DataFolder): Promise<NewRunsFile> {
  return (await readJson<NewRunsFile>(folder, PATHS.newRuns)) ?? { runs: [] };
}

/** The ids of the runs marked new and still new now: marked less than 7 days ago. */
export async function readNewRuns(folder: DataFolder, now = Date.now()): Promise<string[]> {
  const file = await readFile(folder);
  return file.runs.filter((id) => now - markedAt(file, id) < NEW_FOR_MS);
}

/** Marks runs new (an import added them), now; those no longer new are let go. */
export async function markRunsNew(folder: DataFolder, ids: string[], now = Date.now()): Promise<void> {
  if (!ids.length) return;
  const file = await readFile(folder);
  const kept = file.runs.filter((id) => now - markedAt(file, id) < NEW_FOR_MS);
  const runs = [...new Set([...kept, ...ids])];
  const at = new Date(now).toISOString();
  const marked = Object.fromEntries(runs.map((id) => [id, ids.includes(id) ? at : new Date(markedAt(file, id)).toISOString()]));
  await writeJson(folder, PATHS.newRuns, { runs, marked });
}

/** Marks runs seen (opened), or all of them; nothing is written when none of them was new. */
export async function markRunsSeen(folder: DataFolder, ids: string[] | 'all'): Promise<void> {
  const file = await readFile(folder);
  const runs = ids === 'all' ? [] : file.runs.filter((r) => !ids.includes(r));
  if (runs.length === file.runs.length) return;
  const marked = Object.fromEntries(runs.map((id) => [id, new Date(markedAt(file, id)).toISOString()]));
  await writeJson(folder, PATHS.newRuns, { runs, marked });
}
