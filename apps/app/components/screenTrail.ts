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

/**
 * Sent before a screen is left without a link (the search, ⌘K): the screen being left stops writing its
 * address, which the router, still loading the next screen, would take for a return and stay on it.
 */
export const SCREEN_LEAVE = 'isostride.screen-leave';

const BACK = 'strideprism.backTo';
const PREV = 'strideprism.prevPage';

/** The screens a back link can name, by path: keys of their names, shown through t(). */
export const SCREEN_NAMES: Record<string, string> = {
  '/': msg('Runs'), '/dashboard': msg('Dashboard'), '/segments': msg('Segments'), '/compare': msg('Compare'), '/performance': msg('Performance'), '/settings': msg('Settings'),
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

/** What the back link returns to: its link, its name (a key of the texts), the run it is when one, and how many steps back in the history. */
export interface PreviousPage {
  href: string;
  label: string;
  /** a run: its id (null when its address carries none); left out for a screen */
  run?: string | null;
  steps: number;
}

/**
 * What was shown before the current page in the tab's history (requirement "Back to the previous
 * screen": "return to tego co bylo wczensiej"), as the back arrow goes: the addresses of the history's
 * entries, oldest first (path and query; '' for one of another site), and the current one's index.
 * The current page's own changes of address and addresses that are no screen (a redirect) are passed
 * over; null when nothing of the app is behind.
 */
export function previousPage(urls: string[], index: number): PreviousPage | null {
  const here = urls[index] === undefined ? null : pageOf(urls[index]);
  for (let i = index - 1; i >= 0; i--) {
    const url = urls[i];
    if (!url || pageOf(url) === here) continue;
    const path = pathOf(url);
    if (path === '/run') return { href: url, label: msg('Run of {date}'), run: new URLSearchParams(url.split('?')[1] ?? '').get('id'), steps: index - i };
    if (SCREEN_NAMES[path]) return { href: url, label: SCREEN_NAMES[path], steps: index - i };
  }
  return null;
}

/** The start of a run from its id (YYYYMMDD-HHMMSS, local time) as an ISO time without a zone; null for another id. */
export function runStartOf(id: string | null): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(id ?? '');
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null;
}
