import { msg } from '@/lib/i18n';

/**
 * The trail of screens in a browser tab (requirement "Back to the previous screen"): the Run
 * screen's back link returns to the screen the run was opened from, as it was left. The App
 * Shell records each change of the address; the Run screen asks where to go back to.
 */

/** Where the trail is kept: the browser tab's session storage, or a stand-in in tests. */
export interface TrailStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const BACK = 'strideprism.backTo';
const PREV = 'strideprism.prevPage';

/** The screens a back link can name, by path: keys of their names, shown through t(). */
export const SCREEN_NAMES: Record<string, string> = {
  '/': msg('Runs'), '/compare': msg('Compare'), '/performance': msg('Performance'), '/settings': msg('Settings'),
};

const pathOf = (url: string) => url.split('?')[0] || '/';
/** The page an address shows: its path, and for a run the run (its view may change in the address). */
const pageOf = (url: string) => (pathOf(url) === '/run' ? `/run#${new URLSearchParams(url.split('?')[1] ?? '').get('id')}` : pathOf(url));

/**
 * Records an address shown: `last` is the address before it in this tab (null at the first one).
 * A screen other than a run is remembered as the place to go back to, its link updated as it
 * changes; the page left for another page is remembered as the one right behind in the history.
 */
export function recordAddress(store: TrailStore, url: string, last: string | null): void {
  try {
    if (last !== null && pageOf(last) !== pageOf(url)) store.setItem(PREV, last);
    if (pathOf(url) !== '/run' && SCREEN_NAMES[pathOf(url)]) store.setItem(BACK, url);
  } catch { /* no storage: the back link goes to Runs */ }
}

/**
 * Where the Run screen's back link leads: the last screen shown before it, named; through the
 * history when that screen is the page right behind; Runs when no screen was shown before.
 */
export function backTarget(store: TrailStore): { href: string; label: string; viaHistory: boolean } {
  try {
    const href = store.getItem(BACK);
    if (href && SCREEN_NAMES[pathOf(href)]) return { href, label: SCREEN_NAMES[pathOf(href)], viaHistory: store.getItem(PREV) === href };
  } catch { /* no storage */ }
  return { href: '/', label: msg('Runs'), viaHistory: false };
}
