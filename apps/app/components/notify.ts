/**
 * The app's notices, at the bottom right for a few seconds (components/AutoImport draws them): what an
 * import added, and what a job of a screen did ("takie komunikaty chce jako notification ... w prawym
 * dolnym rogu ... przez chwile ... 10 sekund", "tak samo jak import nowego pliku").
 */
export interface Notice {
  text: string;
  /** the runs it added, named as links under it */
  ids?: string[];
}

const EVENT = 'isostride-notice';

/** Shows a notice; one shown before gives way to it. */
export function notify(notice: Notice): void {
  window.dispatchEvent(new CustomEvent<Notice>(EVENT, { detail: notice }));
}

/** Calls back with each notice shown; returns the end of the listening. */
export function onNotice(fn: (n: Notice) => void): () => void {
  const listener = (e: Event) => fn((e as CustomEvent<Notice>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
