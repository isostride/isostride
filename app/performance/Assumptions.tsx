'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CheckStatus, ModelKey, ModelReport, Trust } from '@/lib/load';
import { READING } from './reading';
import { performanceHref } from './structure';

export const TRUST_LABEL: Record<Trust, string> = { ok: 'Reliable', rough: 'Rough', no: 'Not reliable', nodata: 'No data' };
export const STATUS_LABEL: Record<CheckStatus, string> = { met: 'holds', doubt: 'in doubt', unmet: 'does not hold', unknown: 'you must judge' };

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** A model's name without the variant after the dot ("Load of a run · Banister TRIMP"). */
export const shortName = (m: ModelReport) => m.name.split(' · ')[0];
export type Models = Record<ModelKey, ModelReport>;

/** How far a model can be trusted: a dot in the status colour and the word (never the colour alone). */
export function TrustChip({ trust }: { trust: Trust }) {
  return <span className={`trust trust-${trust}`}><i className={`trust-dot ${trust}`} aria-hidden="true" />{TRUST_LABEL[trust]}</span>;
}

/** Why a model has the trust it has, in a line: the model that caps it, or its first assumption that fails. */
export function trustReason(m: ModelReport, by: Models): string {
  if (m.trust === 'nodata') return capital(m.checks.find((c) => c.status === 'unmet')?.detail ?? 'nothing to compute it from yet');
  if (m.cappedBy) return `It rests on “${shortName(by[m.cappedBy])}”, which is ${TRUST_LABEL[by[m.cappedBy].trust].toLowerCase()}`;
  const failing = m.checks.find((c) => c.status === 'unmet') ?? m.checks.find((c) => c.status === 'doubt');
  if (failing) return `${failing.label}: ${STATUS_LABEL[failing.status]}`;
  const open = m.checks.filter((c) => c.status === 'unknown').length;
  return open ? `What the files can show holds; ${open} assumption${open === 1 ? '' : 's'} for you to judge` : 'Every assumption holds';
}

/** The assumptions of a model, each with what the data show. */
function CheckList({ m }: { m: ModelReport }) {
  if (!m.checks.length) return <p className="muted small" style={{ margin: 0 }}>None of its own: it is as good as what it rests on.</p>;
  return (
    <ul className="checks" aria-label={`Assumptions of ${m.name}`}>
      {m.checks.map((c) => (
        <li key={c.key} className={`check check-${c.status}`}>
          <i className={`trust-dot ${c.status}`} aria-hidden="true" />
          <span><b>{c.label}</b> <span className="check-status">· {STATUS_LABEL[c.status]}</span><span className="muted check-detail">{c.detail}</span></span>
        </li>
      ))}
    </ul>
  );
}

/** What a model rests on: the models under it with their trust, then its data and settings. */
function RestsOn({ m, by }: { m: ModelReport; by: Models }) {
  return (
    <div className="rests">
      {m.parents.map((k) => (
        <Link key={k} className="chip rests-model" href={performanceHref(by[k].where.tab, by[k].where.view)}>
          <i className={`trust-dot ${by[k].trust}`} aria-hidden="true" />{shortName(by[k])}<span className="sr-only">, {TRUST_LABEL[by[k].trust]}</span>
        </Link>
      ))}
      {m.inputs.map((x) => <span key={x} className="chip">{x}</span>)}
    </div>
  );
}

/**
 * "Why?" of a model (the author's request of 21 Nov 2026: "wszystkie dodatkowe informacje powinny
 * byc jako why"): the screen shows its name, number and trust; the button opens the rest.
 */
export function WhyButton({ m, open, onToggle }: { m: ModelReport; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`why-btn ${open ? 'on' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={onToggle}>
      Why?<span className="sr-only"> {m.name}: {TRUST_LABEL[m.trust]}</span>
    </button>
  );
}

/** Everything behind a model's number: why it has its trust, its assumptions checked, what it rests on, what it is, how to read it. */
export function WhyPanel({ m, by }: { m: ModelReport; by: Models }) {
  return (
    <div className="why-panel" id={`why-${m.key}`} role="region" aria-label={`Why: ${m.name}`}>
      <p className="why-reason"><b>{TRUST_LABEL[m.trust]}.</b> {trustReason(m, by)}.</p>
      <div className="why-cols">
        <div>
          <div className="model-sub">Assumptions</div>
          <CheckList m={m} />
        </div>
        <div>
          <div className="model-sub">Rests on</div>
          <RestsOn m={m} by={by} />
          <div className="model-sub">What it is</div>
          <p className="why-text">{capital(m.tells)}. {capital(m.method)}.</p>
          <div className="model-sub">How to read it</div>
          <p className="why-text">{READING[m.key]}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * A model's "Why?" in a window over the screen (the runner's request of 22 Nov 2026: "w performance
 * why wyswietlaj jako popup"): its name and trust, then all its "Why?" holds; closed by its button,
 * Esc or a click beside it, the focus going back where it was.
 */
export function WhyDialog({ m, by, onClose }: { m: ModelReport; by: Models; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const done = useRef(onClose);
  useEffect(() => { done.current = onClose; }, [onClose]);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); done.current(); } };
    window.addEventListener('keydown', esc, true);
    return () => { window.removeEventListener('keydown', esc, true); before?.focus?.(); };
  }, []);
  // Over the whole page, not inside the map or the bar it opens from (their styles stay theirs).
  return createPortal(
    <div className="why-backdrop" onClick={onClose}>
      <div className="why-dialog" role="dialog" aria-modal="true" aria-label={`Why: ${m.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="why-dialog-head">
          <h2>{m.name}</h2>
          <TrustChip trust={m.trust} />
          <span className="spacer" />
          <button ref={close} type="button" className="btn sm icon" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <WhyPanel m={m} by={by} />
      </div>
    </div>,
    document.body,
  );
}

/** Above a view: its models in a line, each with its trust and a "Why?", which opens in a window. */
export function WhyBar({ models, by }: { models: ModelKey[]; by: Models }) {
  const [open, setOpen] = useState<ModelKey | null>(null);
  const shown = open && models.includes(open) ? open : null;
  return (
    <div className="why-wrap">
      <div className="why-bar" role="group" aria-label="How far to trust this">
        {models.map((k) => (
          <span key={k} className="why-item" data-model={k} data-trust={by[k].trust}>
            <span className="why-name">{shortName(by[k])}</span>
            <TrustChip trust={by[k].trust} />
            <WhyButton m={by[k]} open={shown === k} onToggle={() => setOpen(shown === k ? null : k)} />
          </span>
        ))}
      </div>
      {shown && <WhyDialog m={by[shown]} by={by} onClose={() => setOpen(null)} />}
    </div>
  );
}
