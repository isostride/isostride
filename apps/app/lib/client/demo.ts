'use client';

import { DEMO_KEY, DEMO_LEFT } from './demoChoice';
import { demoPart, setCopyId, shownJob } from './worker';

/**
 * The demo (the runner's request of 26 Nov 2026: "chce na stronie umiesicc opcje demo ... czyli
 * mozliwosc otwara isostride z przykladowymi danymi"): the app opened on a folder of a sample runner
 * in place of the visitor's own. The folder is one in the browser's private storage, which gives the
 * same kind of handle as a folder picked on the disk, so every screen and the Processing Worker read it
 * as they read any folder; nothing is picked and no permission asked. This script is loaded only when
 * the demo is opened or left (lib/client/demoChoice says whether it is): the screens' own stay in their budget.
 */

/** The demo's folder in the browser's private storage; its name is shown as the folder's. */
const DEMO_FOLDER = 'IsoStride demo';

/** What a run of the demo takes in the browser's storage, about, bytes: its FIT file, its samples and its track. */
const RUN_BYTES = 650_000;
/** Room left over beside the demo, bytes: the browser's storage is not filled to its last megabyte. */
const ROOM_TO_SPARE = 40_000_000;

/**
 * Whether the browser's storage has room for so many more runs of the demo: a private window, or a disk nearly
 * full, gives a site far less than the some 300 MB the two years take, and the history then failed half written.
 * A browser that does not say how much room it has is taken to have it.
 */
async function roomFor(runs: number): Promise<boolean> {
  try {
    const { quota, usage } = await navigator.storage.estimate();
    return quota === undefined || quota - (usage ?? 0) > runs * RUN_BYTES + ROOM_TO_SPARE;
  } catch {
    return true;
  }
}

/** The language the demo's own texts are written in: the one the page is in. */
const demoLanguage = (): 'en' | 'pl' => (document.documentElement.lang === 'pl' ? 'pl' : 'en');

/**
 * The demo's folder with its last months made (seconds; `onProgress` as they are made): the app opens on
 * it. The earlier history is then made behind the app, call after call (each takes its turn, so a tag
 * saved meanwhile is not kept waiting for the whole of it) under one job shown: the screens read the data
 * again once, when all of it is there; `onHistory` says how far it is, null when it is done, and 'short' when
 * the browser has no room for it: the demo then stays its last months.
 */
export async function openDemoFolder(onProgress: (done: number, total: number) => void, onHistory: (p: { done: number; total: number } | 'short' | null) => void): Promise<FileSystemDirectoryHandle> {
  // A demo left a moment ago and chosen again: its folder is not made while it is still being removed.
  await removing;
  const handle = await (await navigator.storage.getDirectory()).getDirectoryHandle(DEMO_FOLDER, { create: true });
  const lang = demoLanguage();
  // The demo's folder is in the browser already: no copy of it is kept.
  setCopyId(null);
  const total = (await demoPart(handle, 'recent', lang, (p) => onProgress(p.done, p.total))).remaining ?? 0;
  if (total > 0 && !(await roomFor(total))) onHistory('short');
  else if (total > 0) {
    onHistory({ done: 0, total });
    void (async () => {
      const job = shownJob('demo');
      try {
        let left = total;
        while (left > 0) {
          const made = total - left;
          const at = (p: { done: number }) => { const done = Math.min(total, made + p.done); job.advance(done, total); onHistory({ done, total }); };
          const m = await demoPart(handle, 'more', lang, at, job.k);
          // Nothing more could be made (the folder holds it all by now): no call after this one.
          if (!m.imported) break;
          left = m.remaining ?? 0;
        }
      } finally {
        job.end();
        onHistory(null);
      }
    })().catch(() => undefined);
  }
  return handle;
}

/**
 * Removes the folder of a demo that was left, when the app opens: a worker still writing it when the
 * visitor left kept it from being removed then, and some hundred megabytes of sample runs stayed in the
 * browser for good. Tried again at each opening until it is gone.
 */
export function removeLeftDemo(): Promise<void> {
  removing = (async () => {
    try {
      if (localStorage.getItem(DEMO_KEY) !== DEMO_LEFT) return;
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(DEMO_FOLDER, { recursive: true }).catch((e: unknown) => { if (!(e instanceof DOMException && e.name === 'NotFoundError')) throw e; });
      // The demo chosen again meanwhile keeps its choice.
      if (localStorage.getItem(DEMO_KEY) === DEMO_LEFT) localStorage.removeItem(DEMO_KEY);
    } catch {
      // Still in use, or no storage: the next opening tries again.
    }
  })();
  return removing;
}

/** The removal of a left demo under way, if any. */
let removing: Promise<void> = Promise.resolve();
