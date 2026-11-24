'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '@/lib/i18n';

/** What a confirmation asks: a title, what will happen, the word on the button that does it. */
export interface ConfirmOptions {
  title: string;
  message: string;
  /** the button that does it, e.g. "Delete" */
  confirm: string;
  /** a change that cannot be undone: the button in the colour of an error */
  danger?: boolean;
}

/**
 * The app's own confirmation instead of the browser's (the runner's request of 22 Nov 2026:
 * "usuwanie elementow powoduje pokazanie sie wbudowanego popupa chrome ... chce miec wlasny w
 * aplikacji"; requirement "Confirmations in the app"): a dialog over the screen in the app's look,
 * Cancel focused first, Esc or a click beside it cancelling, Tab kept within it.
 */
function ConfirmDialog({ options, onAnswer }: { options: ConfirmOptions; onAnswer: (yes: boolean) => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  const ok = useRef<HTMLButtonElement>(null);
  const answer = useRef(onAnswer);
  useEffect(() => { answer.current = onAnswer; }, [onAnswer]);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    cancel.current?.focus();
    // Caught first, so a sheet under it does not close on the same Esc.
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); answer.current(false); }
      if (e.key === 'Tab') {
        e.preventDefault();
        (document.activeElement === cancel.current ? ok.current : cancel.current)?.focus();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('keydown', key, true); before?.focus?.(); };
  }, []);
  return (
    <div className="confirm-backdrop" onClick={() => onAnswer(false)}>
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-title">{options.title}</h2>
        <p id="confirm-message">{options.message}</p>
        <div className="confirm-actions">
          <button ref={cancel} type="button" className="btn" onClick={() => onAnswer(false)}>{t('Cancel')}</button>
          <button ref={ok} type="button" className={`btn ${options.danger ? 'danger-solid' : 'primary'}`} onClick={() => onAnswer(true)}>{options.confirm}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * A confirmation of the app's own: the dialog to render, and `ask`, which shows it and resolves
 * true when the runner confirms, false when they cancel.
 */
export function useConfirm(): [ReactNode, (o: ConfirmOptions) => Promise<boolean>] {
  const [open, setOpen] = useState<{ options: ConfirmOptions; resolve: (yes: boolean) => void } | null>(null);
  const ask = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setOpen({ options, resolve })), []);
  const dialog = open && <ConfirmDialog options={open.options} onAnswer={(yes) => { open.resolve(yes); setOpen(null); }} />;
  return [dialog, ask];
}
