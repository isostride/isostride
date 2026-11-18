import { PATHS, readJson, writeJson, type DataFolder } from '@/lib/fs/folder';

/** What the runner says about one run (user/run-tags.json). */
export interface RunTag {
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

export async function writeRunTags(folder: DataFolder, file: RunTagsFile): Promise<void> {
  // Empty tags are dropped so the file holds only what the runner entered.
  const tags = Object.fromEntries(
    Object.entries(file.tags)
      .map(([id, t]) => [id, Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined && v !== ''))] as const)
      .filter(([, t]) => Object.keys(t).length > 0),
  );
  await writeJson(folder, PATHS.runTags, { dictionary: file.dictionary, tags } satisfies RunTagsFile);
}
