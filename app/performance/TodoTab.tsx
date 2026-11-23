'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { todoList, type ModelReport, type Todo, type TodoKind, type TodoPlace } from '@/lib/load';
import { TRUST_LABEL, shortName, type Models } from './Assumptions';
import { performanceHref } from './structure';

const KINDS: { kind: TodoKind; title: string; hint: string }[] = [
  { kind: 'set', title: 'Set now', hint: 'a minute each, in the app' },
  { kind: 'record', title: 'Record in your runs', hint: 'from your next runs' },
  { kind: 'train', title: 'Run', hint: 'in your training' },
  { kind: 'wait', title: 'With time', hint: 'they come as you keep running' },
];
const PLACE: Record<Exclude<TodoPlace, null>, [string, string]> = {
  model: ['/settings?tab=models', 'Open Settings › Models'],
  zones: ['/settings', 'Open the zones in Settings'],
  gear: ['/settings?tab=gear', 'Open Gear in Settings'],
  folder: ['/folder', 'Open the Data folder'],
};
const STATUS: Record<Todo['status'], string> = { unmet: 'Holds a model back', doubt: 'Leaves a model in doubt', unknown: 'Yours to judge' };
const SET_ASIDE = 'strideprism.todoSetAside';

/**
 * To do (the runner's request of 21 Nov 2026: "w sekcji performance chce zakladke todo .. w ktorej
 * jest lista rzeczy do zrobienia aby modele dzialay poprawnie"; requirement "To do for the models"):
 * the things the runner can do so the models work, from the checks of their assumptions — what to
 * set, record, run, and what comes with time — each with what it is, what the data show now, the
 * models it holds back and where it is done; the done ones at the end. An item the files cannot
 * check (whether all your running is here) the runner may set aside, in this browser.
 */
export function TodoTab({ models, by }: { models: ModelReport[]; by: Models }) {
  const all = todoList(models);
  const [aside, setAside] = useState<string[]>([]);
  useEffect(() => { try { setAside(JSON.parse(localStorage.getItem(SET_ASIDE) ?? '[]')); } catch { /* none */ } }, []);
  const toggle = (key: string) => {
    const next = aside.includes(key) ? aside.filter((k) => k !== key) : [...aside, key];
    setAside(next);
    try { localStorage.setItem(SET_ASIDE, JSON.stringify(next)); } catch { /* kept for this visit */ }
  };
  const open = all.filter((t) => !t.done && !aside.includes(t.key));
  const closed = all.filter((t) => t.done || aside.includes(t.key));
  const share = all.length ? closed.length / all.length : 1;

  const item = (t: Todo) => {
    const setAsideNow = aside.includes(t.key) && !t.done;
    return (
      <li key={t.key} className={`todo-item ${t.done ? 'done' : setAsideNow ? 'aside' : `todo-${t.status}`}`} data-todo={t.key}>
        <span className="todo-mark" aria-hidden="true">{t.done ? '✓' : setAsideNow ? '–' : ''}</span>
        <div className="todo-body">
          <div className="todo-title">
            <b>{t.title}</b>
            <span className="todo-state">{t.done ? 'Done' : setAsideNow ? 'Set aside' : STATUS[t.status]}</span>
          </div>
          {!t.done && <p className="todo-how">{t.how}</p>}
          {!t.done && !setAsideNow && t.now.length > 0 && (
            <ul className="todo-now">{t.now.map((l) => <li key={l}>{l}</li>)}</ul>
          )}
          {!t.done && t.models.length > 0 && (
            <div className="todo-models">
              <span className="muted small">For</span>
              {t.models.map((k) => (
                <Link key={k} className="chip todo-model" href={performanceHref(by[k].where.tab, by[k].where.view)} title={`${by[k].name}: ${TRUST_LABEL[by[k].trust].toLowerCase()}`}>
                  <i className={`trust-dot ${by[k].trust}`} aria-hidden="true" />{shortName(by[k])}
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="todo-actions">
          {!t.done && t.place && <Link className="btn sm" href={PLACE[t.place][0]}>{PLACE[t.place][1]} →</Link>}
          {!t.done && t.status === 'unknown' && (
            <button type="button" className="btn sm ghost" onClick={() => toggle(t.key)}>{setAsideNow ? 'Bring back' : 'Set aside'}</button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="todo">
      <section className="card todo-head" aria-label="Progress">
        <div>
          <h2>{open.length ? `${open.length} thing${open.length === 1 ? '' : 's'} to do` : 'Nothing to do'}</h2>
          <p className="muted small">So that the models work as they should: from the checks of their assumptions. The limits of a method, which nothing you do changes, stay behind each model&apos;s Why?.</p>
        </div>
        <div className="todo-progress" role="img" aria-label={`${closed.length} of ${all.length} done`}>
          <div className="progress"><div style={{ width: `${Math.round(share * 100)}%` }} /></div>
          <span className="muted small tnum">{closed.length} of {all.length} done</span>
        </div>
      </section>
      {KINDS.map(({ kind, title, hint }) => {
        const list = open.filter((t) => t.kind === kind);
        return list.length ? (
          <section key={kind} className="card todo-group" aria-label={title}>
            <h3>{title} <span className="muted">· {hint}</span></h3>
            <ul className="todo-list">{list.map(item)}</ul>
          </section>
        ) : null;
      })}
      {closed.length > 0 && (
        <details className="card todo-group todo-closed">
          <summary><h3>Done and set aside <span className="muted">· {closed.length}</span></h3></summary>
          <ul className="todo-list">{closed.map(item)}</ul>
        </details>
      )}
    </div>
  );
}
