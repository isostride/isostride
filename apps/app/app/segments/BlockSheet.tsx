'use client';

import { useEffect, useRef, useState } from 'react';
import { EditGlyph, useConfirm } from '@/components';
import { asRuleDefinition, shownName, type BlockDefinition, type BlockStart, type Rule, type Tolerances } from '@/lib/blocks';
import { useLocale } from '@/lib/client';
import { msg, number, t } from '@/lib/i18n';
import { RuleBuilder, type BuilderOptions } from './RuleBuilder';

const fmtPace = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

const FIELDS: { key: Exclude<keyof Tolerances, 'start'>; label: string; unit: string; scale?: number; pace?: boolean }[] = [
  { key: 'paceMin', label: msg('Pace band from'), unit: '/km', pace: true },
  { key: 'paceMax', label: msg('Pace band to'), unit: '/km', pace: true },
  { key: 'gradeMax', label: msg('Grade: effort pace vs pace, max'), unit: '%', scale: 100 },
  { key: 'cvMax', label: msg('Pace steadiness: CV below'), unit: '' },
  { key: 'effortBeforeMax', label: msg('Effort in the 2 min before, max difference'), unit: '%', scale: 100 },
  { key: 'hrSkip', label: msg('Heart rate from minute (of each effort); empty: the whole effort'), unit: 'min', scale: 1 / 60 },
  { key: 'routeShare', label: msg('Route: points matched, min'), unit: '%', scale: 100 },
  { key: 'routeRadius', label: msg('Route: within'), unit: 'm' },
];

/**
 * The one editor of a block (the runner's request of 22 Nov 2026: "nie chce tworzyc blokow na 5
 * roznych sposob"; requirement "One way to make a block"): which runs, the stretch of each, the
 * conditions, how many per run and the statistic, with the segments counted as it changes, and the
 * matching checks. A new block, one kept, a suggestion or one taken from a run all open here.
 */
export function BlockSheet({ def, kept, options, handle, onClose, onSave, onDelete, title = msg('Segment') }: {
  def: BlockDefinition;
  /** a block kept in the folder (it can be deleted), or one not kept yet */
  kept: boolean;
  options: BuilderOptions;
  handle: FileSystemDirectoryHandle;
  onClose: () => void;
  onSave: (d: BlockDefinition) => void;
  onDelete?: (d: BlockDefinition) => void;
  /** the kind of the editor, a key of the texts: "Segment", "New segment", "Suggested segment" */
  title?: string;
}) {
  // The editor follows a change of the language.
  useLocale();
  // One model: an older kind of block is edited as the rule it is.
  const one = asRuleDefinition(def);
  const { type: _type, ...rule } = one.params as Extract<BlockDefinition['params'], { type: 'rule' }>;
  // A name the app made, in the language in use; one typed, as it is.
  const name = def.name && shownName(def.name, rule as Rule);
  const [tol, setTol] = useState<Tolerances>(one.tolerances);
  // Opened, the editor takes the focus; Esc closes it wherever the focus is.
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    box.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  const [confirmDialog, confirm] = useConfirm();
  const remove = async () => { if (onDelete && (await confirm({ title: t('Delete this segment?'), message: t('“{name}” and its efforts go. If it came from a suggestion, the suggestion is offered again.', { name }), confirm: t('Delete'), danger: true }))) onDelete(def); };
  const show = (f: (typeof FIELDS)[number]) => {
    const v = tol[f.key];
    if (v === null) return '';
    return f.pace ? fmtPace(v) : number(Math.round(v * (f.scale ?? 1) * 100) / 100);
  };
  const parse = (f: (typeof FIELDS)[number], text: string): number | null => {
    if (!text.trim()) return null;
    if (f.pace) {
      const [m, s] = text.split(':').map(Number);
      return Number.isFinite(m) ? m * 60 + (s || 0) : null;
    }
    const n = Number(text.replace(',', '.'));
    return Number.isFinite(n) ? n / (f.scale ?? 1) : null;
  };
  const fields = FIELDS.filter((f) => rule.shape.type === 'route' || !f.key.startsWith('route'));
  return (
    // In the middle of the screen, as every editor of the app ("edit zawsze pokazuje popup na srodku ...
    // edytowane segmentow tez tam przenies"; ADR "One way to add, edit and delete"): Cancel or Esc closes it.
    <>
    <div className="edit-backdrop" onClick={onClose}>
      <div ref={box} tabIndex={-1} className="edit-dialog wide block-dialog" role="dialog" aria-modal="true" aria-label={t(title)} onClick={(e) => e.stopPropagation()}>
        <header className="edit-head">
          <EditGlyph kind="segment" />
          <div className="edit-head-text">
            <span className="edit-kind">{kept ? t('Segment') : t(title)}</span>
            <h2>{name || t('A segment of your rule')}</h2>
          </div>
          <button type="button" className="edit-close" aria-label={t('Close')} onClick={onClose}>✕</button>
        </header>
        <div className="edit-body">
        <RuleBuilder initial={rule as Rule} initialName={kept || def.name ? def.name : undefined} options={options} handle={handle} tolerances={tol} footer={(s) => (
          <>
            {/* Delete, Cancel and Save, the words of every editor of the app ("delete segment -> tekst ujednolic .. poprostu delete"; ADR "One way to add, edit and delete"). */}
            {kept && onDelete && <button type="button" className="btn danger edit-delete" onClick={remove}>{t('Delete')}</button>}
            <button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button>
            {/* The wizard's Back and Next; Save on its last step (requirement "Segment editor as a wizard"). */}
            {s.nav}
            {s.last && <button type="button" className="btn primary" disabled={!s.segments} onClick={() => onSave({ ...one, name: s.name, params: { type: 'rule', ...s.rule }, tolerances: tol })}>{t('Save')}</button>}
          </>
        )}>
          <details className="matching-checks">
            <summary>{t('Matching checks')} <span className="muted small">· {t('what every effort is checked for besides the rule; empty: not checked')}</span></summary>
            {fields.map((f) => (
              <label key={f.key} className="field">
                <span>{t(f.label)}</span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input aria-label={t(f.label)} defaultValue={show(f)} placeholder="–" onBlur={(e) => setTol({ ...tol, [f.key]: parse(f, e.target.value) } as Tolerances)} style={{ width: 80 }} />
                  <span className="muted small" style={{ width: 28 }}>{f.unit}</span>
                </span>
              </label>
            ))}
            {/* The start is the rule's (More, above); an older block's own check shows here while it is set. */}
            {tol.start !== 'any' && <label className="field">
              <span>{t('Start of every effort')}</span>
              <select aria-label={t('Start of every effort')} value={tol.start} onChange={(e) => setTol({ ...tol, start: e.target.value as BlockStart })}>
                <option value="any">{t('any')}</option>
                <option value="standing">{t('standing (right after a stop)')}</option>
                <option value="flying">{t('flying (on the move)')}</option>
              </select>
            </label>}
          </details>
        </RuleBuilder>
        </div>
      </div>
    </div>
    {/* Beside the editor, not in it: a click beside the confirmation does not close the editor too. */}
    {confirmDialog}
    </>
  );
}
