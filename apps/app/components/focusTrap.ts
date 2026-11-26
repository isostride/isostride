'use client';

import { useEffect, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * Keeps a Tab inside a dialog over the screen: from its last control to its first, back the other way,
 * and into it when the focus lies outside. Nothing while the focus is in another dialog opened over it
 * (a confirmation), which keeps its own.
 */
export function keepTabInside(e: KeyboardEvent, box: HTMLElement | null): void {
  if (e.key !== 'Tab' || !box) return;
  const active = document.activeElement as HTMLElement | null;
  const over = active?.closest<HTMLElement>('[aria-modal="true"]');
  if (over && over !== box && !box.contains(over)) return;
  const inside = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
  if (!inside.length) { e.preventDefault(); return; }
  const at = active ? inside.indexOf(active) : -1;
  if (e.shiftKey ? at <= 0 : at === -1 || at === inside.length - 1) {
    e.preventDefault();
    inside[e.shiftKey ? inside.length - 1 : 0].focus();
  }
}

/**
 * A dialog's Tab kept inside it for as long as it is open, and the focus given back, as it closes, to
 * where it was (the button that opened it). For the dialogs that set their first focus and their Esc
 * themselves (the review of 26 Nov 2026: five of them let Tab out to the page under the backdrop).
 */
export function useFocusTrap(dialog: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => keepTabInside(e, dialog.current);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); before?.focus?.(); };
  }, [dialog]);
}
