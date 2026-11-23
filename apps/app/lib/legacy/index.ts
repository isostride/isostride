// Data left by earlier versions, moved where this one keeps it. Loaded only when a folder is opened
// (a dynamic import), so the pages' scripts do not carry it.
import { PATHS, joinPath, type DataFolder } from '@/lib/fs';

/** Where versions before 23 Nov 2026 kept the app's data; moved to .isostride/ when the folder is opened. */
export const LEGACY_ROOT = 'strideprism';

/**
 * Moves the app's data from strideprism/ to .isostride/: every file copied over, then strideprism/
 * removed, so a move broken off is made again from the start on the next opening and nothing is
 * lost. True when there was something to move.
 */
export async function moveLegacyData(folder: DataFolder): Promise<boolean> {
  const top = await folder.list('');
  if (!top.some((e) => e.kind === 'directory' && e.name === LEGACY_ROOT)) return false;
  await copyTree(folder, LEGACY_ROOT, PATHS.root);
  await folder.remove(LEGACY_ROOT);
  return true;
}

async function copyTree(folder: DataFolder, from: string, to: string): Promise<void> {
  for (const e of await folder.list(from)) {
    const source = joinPath(from, e.name);
    const target = joinPath(to, e.name);
    if (e.kind === 'directory') await copyTree(folder, source, target);
    else {
      const text = await folder.readText(source);
      if (text !== null) await folder.writeText(target, text);
    }
  }
}
