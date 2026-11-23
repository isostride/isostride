import { PATHS, readJson, writeJson, type DataFolder } from '@/lib/fs';

/**
 * The setup wizard (the runner's request of 23 Nov 2026: "chcialbym wizard ... ktory bedzie dostepny
 * z poziomu settings oraz tez bedzie uruchamial sie na poczatku ... ustawienia, wybor modelu, import
 * katalogu itp"): whether it was gone through or skipped in a folder, kept in the folder, so that it
 * opens by itself once in each folder ("przy starcie pierwszym powinien uruchamiac wizarda"), on a
 * folder set up before too, filled with what is saved there.
 */
export interface SetupFile {
  state: 'done' | 'skipped';
  /** ISO time */
  at: string;
}

export async function readSetup(folder: DataFolder): Promise<SetupFile | null> {
  const f = await readJson<SetupFile>(folder, PATHS.setup);
  return f && (f.state === 'done' || f.state === 'skipped') ? f : null;
}

export async function writeSetup(folder: DataFolder, state: SetupFile['state'], at = new Date()): Promise<void> {
  await writeJson(folder, PATHS.setup, { state, at: at.toISOString() } satisfies SetupFile);
}

/** The wizard opens by itself on a folder where it was neither gone through nor skipped. */
export function setupWanted(setup: SetupFile | null): boolean {
  return !setup;
}
