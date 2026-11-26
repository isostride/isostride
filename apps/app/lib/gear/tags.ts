import { PATHS, readJson, writeJson, type DataFolder } from '@/lib/fs';

/** What the runner says about one run (user/run-tags.json). */
export interface RunTag {
  /** the runner's own title of the run (a COROS test, a race): criteria blocks filter by it */
  title?: string;
  workoutType?: string;
  techniqueCue?: string;
  /** id of the shoes worn instead of the ones assigned by date */
  shoesOverride?: string;
  note?: string;
}

export interface TagDictionary {
  workoutTypes: string[];
  techniqueCues: string[];
}

export interface RunTagsFile {
  dictionary: TagDictionary;
  /** by run id */
  tags: Record<string, RunTag>;
}

export const DEFAULT_DICTIONARY: TagDictionary = {
  workoutTypes: ['easy', 'long', 'tempo', 'intervals', 'race'],
  techniqueCues: [],
};

export async function readRunTags(folder: DataFolder): Promise<RunTagsFile> {
  return (await readJson<RunTagsFile>(folder, PATHS.runTags)) ?? { dictionary: { ...DEFAULT_DICTIONARY }, tags: {} };
}

/**
 * Sets one run's tags in the file as it is now, not as a screen read it when it opened: written back whole
 * from a screen's copy, a note set meanwhile in another window (or by another screen of this one) was gone
 * (the review of 26 Nov 2026).
 */
export async function saveRunTag(folder: DataFolder, runId: string, tag: RunTag): Promise<RunTagsFile> {
  const file = await readRunTags(folder);
  const next = { ...file, tags: { ...file.tags, [runId]: tag } };
  await writeRunTags(folder, next);
  return next;
}

export async function writeRunTags(folder: DataFolder, file: RunTagsFile): Promise<void> {
  // Empty tags are dropped so the file holds only what the runner entered.
  const tags = Object.fromEntries(
    Object.entries(file.tags)
      .map(([id, t]) => [id, Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined && v !== ''))] as const)
      .filter(([, t]) => Object.keys(t).length > 0),
  );
  await writeJson(folder, PATHS.runTags, { dictionary: file.dictionary, tags } satisfies RunTagsFile);
}

/** The two lists of the tag dictionary, and the field of a run's tag each fills. */
export type TagKind = 'workoutTypes' | 'techniqueCues';
const FIELD: Record<TagKind, 'workoutType' | 'techniqueCue'> = { workoutTypes: 'workoutType', techniqueCues: 'techniqueCue' };

/**
 * The tags with one renamed (the runner's "jak juz stworze tag to tez nie moge zmienic jego nazwy"):
 * in the dictionary, in its place, and on every run tagged with it. Unchanged when the new name is
 * empty, the same, or another tag of the list already.
 */
export function renameTag(file: RunTagsFile, kind: TagKind, from: string, to: string): RunTagsFile {
  const name = to.trim();
  const list = file.dictionary[kind];
  if (!name || name === from || !list.includes(from) || list.includes(name)) return file;
  const field = FIELD[kind];
  return {
    dictionary: { ...file.dictionary, [kind]: list.map((v) => (v === from ? name : v)) },
    tags: Object.fromEntries(Object.entries(file.tags).map(([id, t]) => [id, t[field] === from ? { ...t, [field]: name } : t])),
  };
}
