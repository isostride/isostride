'use client';

import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { keepTabInside } from './focusTrap';
import { t } from '@/lib/i18n';

/** What is edited: the glyph in the dialog's head. */
export type EditKind = 'gear' | 'tag' | 'analysis' | 'run' | 'segment';

const GLYPH: Record<EditKind, string> = {
  gear: 'M3 16.5h18v2.5H3zM4 16.5l1.6-7.2 4 1.2 2.6-3.8 3.3 1.1L20 14v2.5',
  tag: 'M3 12V4h8l10 10-8 8L3 12z|M7.5 8.5h.01',
  analysis: 'M4 19V5|M4 19h16|M8 15l3.5-4 3 2.5L19 8',
  run: 'M3 12h4l2-5 4 10 2-5h6',
  segment: 'M4 18c3-8 5-8 8 0s5 8 8 0|M4 6h4|M16 6h4',
};

/** The glyph of what is edited, drawn in the head of its dialog. */
export function EditGlyph({ kind }: { kind: EditKind }) {
  return (
    <span className="edit-glyph" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {GLYPH[kind].split('|').map((d) => <path key={d} d={d} />)}
      </svg>
    </span>
  );
}

/**
 * The one editor of the app (ADR "One way to add, edit and delete"; the runner's "edit zawsze pokazuje
 * popup na srodku w ktorym moge edytowac lub tez usuwac"): a dialog in the middle of the screen. Its
 * head says what is edited (a glyph, its kind, its name) and closes it; its body holds the fields; its
 * foot Delete (when it can be deleted) apart on the left, Cancel and Save on the right. Nothing is
 * saved before Save; Enter saves, Esc or a click beside it cancels; the first field takes the focus
 * and Tab stays within the dialog. Deleting asks first: the caller's onDelete does.
 */
export function EditDialog({ kind, kindLabel, title, children, onSave, onCancel, onDelete, saveLabel, canSave = true }: {
  kind: EditKind;
  /** the kind as read above the name, e.g. "Shoes", "Workout type" */
  kindLabel: string;
  /** the name of what is edited; the dialog is named "Edit <title>" */
  title: string;
  children: ReactNode;
  onSave: () => void;
  onCancel: () => void;
  /** offered only for what can be deleted; it asks before deleting */
  onDelete?: () => void;
  /** the Save button's word, already in the language in use; Save by default */
  saveLabel?: string;
  canSave?: boolean;
}) {
  const box = useRef<HTMLFormElement>(null);
  const cancel = useRef(onCancel);
  useEffect(() => { cancel.current = onCancel; }, [onCancel]);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const first = box.current?.querySelector<HTMLElement>('.edit-body input:not([type=hidden]), .edit-body select, .edit-body textarea');
    (first ?? box.current)?.focus();
    // A confirmation over it catches its Esc first (components/ConfirmDialog).
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); cancel.current(); }
      // From the form itself too (it holds the focus when it has no field): Shift+Tab then left for the page behind.
      keepTabInside(e, box.current);
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); before?.focus?.(); };
  }, []);
  return (
    <div className="edit-backdrop" onClick={onCancel}>
      <form ref={box} tabIndex={-1} className="edit-dialog" role="dialog" aria-modal="true" aria-label={t('Edit {name}', { name: title })}
        onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (canSave) onSave(); }}>
        <header className="edit-head">
          <EditGlyph kind={kind} />
          <div className="edit-head-text">
            <span className="edit-kind">{kindLabel}</span>
            <h2>{title}</h2>
          </div>
          <button type="button" className="edit-close" aria-label={t('Close')} onClick={onCancel}>✕</button>
        </header>
        <div className="edit-body">{children}</div>
        <footer className="edit-foot">
          {onDelete && (
            <button type="button" className="btn danger edit-delete" onClick={onDelete}>{t('Delete')}</button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onCancel}>{t('Cancel')}</button>
          <button type="submit" className="btn primary" disabled={!canSave}>{saveLabel ?? t('Save')}</button>
        </footer>
      </form>
    </div>
  );
}

/**
 * The Edit of a row or a chip, as an icon (the runner's "wszedzie jest slowo edit .... i to biednie
 * wyglada .. moze jakas ikonka?"): a pencil, the same on every list, named "Edit <name>" and titled
 * Edit; it opens the thing's EditDialog. Small in a chip, 32 px in a row (24 px at least either way).
 */
export function EditButton({ name, onClick, disabled = false, small = false }: { name: string; onClick: (e: MouseEvent<HTMLButtonElement>) => void; disabled?: boolean; small?: boolean }) {
  return (
    <button type="button" className={`edit-btn ${small ? 'small' : ''}`} aria-label={t('Edit {name}', { name })} title={t('Edit')} disabled={disabled} onClick={onClick}>
      <svg viewBox="0 0 24 24" width={small ? 13 : 15} height={small ? 13 : 15} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" />
      </svg>
    </button>
  );
}
