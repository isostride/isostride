'use client';

/**
 * Whether this browser is on the demo (lib/client/demo, loaded only then): the choice is kept in the
 * browser (the demo in every tab) until the visitor leaves it; a folder they chose before stays
 * remembered and is there again when they do.
 */
export const DEMO_KEY = 'isostride.demo';
/** The value of the key once the demo is left and its folder waits to be removed. */
export const DEMO_LEFT = 'left';

/** Whether this browser is on the demo: asked for by the link (?demo, taken out of the address once read) or chosen before. */
export function demoChosen(): boolean {
  try {
    const url = new URL(location.href);
    if (url.searchParams.has('demo')) {
      localStorage.setItem(DEMO_KEY, '1');
      url.searchParams.delete('demo');
      history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
    return localStorage.getItem(DEMO_KEY) === '1';
  } catch {
    return false;
  }
}

/** Whether the demo was left and its folder still waits to be removed. */
export function demoLeft(): boolean {
  try { return localStorage.getItem(DEMO_KEY) === DEMO_LEFT; } catch { return false; }
}

/** Whether the demo can be made here: a private storage whose files a page and its workers can write. */
export function demoSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function' && typeof Worker === 'function'
    && typeof FileSystemFileHandle !== 'undefined' && 'createWritable' in FileSystemFileHandle.prototype;
}

export function chooseDemo(): void {
  try { localStorage.setItem(DEMO_KEY, '1'); } catch { /* the demo of this tab alone */ }
}

/** The demo left: its folder is to be removed (lib/client/demo: removeLeftDemo), now or when the app next opens. */
export function forgetDemo(): void {
  try { if (localStorage.getItem(DEMO_KEY)) localStorage.setItem(DEMO_KEY, DEMO_LEFT); } catch { /* nothing kept */ }
}
