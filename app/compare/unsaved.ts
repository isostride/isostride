import type { BlockDefinition } from '@/lib/blocks';

/**
 * Segments shown in Compare before they are saved (the runner's answer "tak" to "Compare these
 * efforts: otwiera Compare z tymi efforts jako trend"): a same route or a same profile from Find
 * similar is too large for the link, so it waits in this tab of the browser under a short code the
 * link carries (t~…), until it is saved or the tab is closed.
 */
const KEY = 'strideprism.unsavedSegments';

/** True for the code of an unsaved segment. */
export const isUnsaved = (code: string) => code.startsWith('t~');

function all(): Record<string, BlockDefinition> {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Record<string, BlockDefinition>; } catch { return {}; }
}

/** The segment kept under a code, or null (another tab, or the tab was closed). */
export function readUnsaved(code: string): BlockDefinition | null {
  return isUnsaved(code) ? all()[code] ?? null : null;
}

/** Keeps a segment for this tab: its code, for the link (a new code unless one is given). */
export function keepUnsaved(def: BlockDefinition, code = `t~${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`): string {
  try { sessionStorage.setItem(KEY, JSON.stringify({ ...all(), [code]: def })); } catch { /* not kept: the link opens nothing */ }
  return code;
}
