import { PATHS, readJson, writeJson, type DataFolder } from './folder';

/**
 * The runs an import added that the runner has not looked at yet (requirement "New runs marked new"),
 * kept in user/new-runs.json: marked New on the Runs screen until the run is opened or all are marked
 * as seen. Kept in the folder, so another browser on it sees them too.
 */
interface NewRunsFile {
  runs: string[];
}

/** The ids of the runs marked new. */
export async function readNewRuns(folder: DataFolder): Promise<string[]> {
  return (await readJson<NewRunsFile>(folder, PATHS.newRuns))?.runs ?? [];
}

/** Marks runs new (an import added them). */
export async function markRunsNew(folder: DataFolder, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const runs = await readNewRuns(folder);
  await writeJson(folder, PATHS.newRuns, { runs: [...new Set([...runs, ...ids])] });
}

/** Marks runs seen (opened), or all of them; nothing is written when none of them was new. */
export async function markRunsSeen(folder: DataFolder, ids: string[] | 'all'): Promise<void> {
  const runs = await readNewRuns(folder);
  const left = ids === 'all' ? [] : runs.filter((r) => !ids.includes(r));
  if (left.length !== runs.length) await writeJson(folder, PATHS.newRuns, { runs: left });
}
