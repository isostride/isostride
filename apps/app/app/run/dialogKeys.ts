'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The keys and the focus of a dialog over the screen (aria-modal): the focus goes to `first` as it
 * opens, Tab stays among what the dialog holds, Esc closes it, and as it closes the focus goes back to
 * where it was (the button that opened it). Listened to once for the dialog's life, whatever the screen
 * under it draws again: with `onClose` an effect's dependency, every drawing of that screen took the
 * focus back to the close button (the review of 26 Nov 2026: three dialogs let Tab out to the page behind).
 */
export function useDialogKeys(dialog: RefObject<HTMLElement | null>, first: RefObject<HTMLElement | null>, onClose: () => void): void {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    first.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close.current(); return; }
      if (e.key !== 'Tab' || !dialog.current) return;
      const inside = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!inside.length) { e.preventDefault(); return; }
      const at = inside.indexOf(document.activeElement as HTMLElement);
      // Out of the dialog, or at its end: to its other end.
      if (e.shiftKey ? at <= 0 : at === -1 || at === inside.length - 1) {
        e.preventDefault();
        inside[e.shiftKey ? inside.length - 1 : 0].focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); before?.focus?.(); };
    // The refs are the same for the dialog's life.
  }, [dialog, first]);
}
