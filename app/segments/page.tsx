'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useConfirm, useDataVersion } from '@/components';
import { RECOMMENDATIONS_PATH, RULE_TOLERANCES, asRule, fromRecommendation, readDefinitions, ruleName, ruleOf, shapeName, writeDefinitions, type BlockDefinition, type BlockInstance, type BlockInstancesFile, type Recommendation } from '@/lib/blocks';
import { runInWorker, useOpenFolder } from '@/lib/client';
import { date } from '@/lib/format';
import { PATHS, readJson } from '@/lib/fs';
import type { RunsIndex } from '@/lib/kernel';
import { builderOptions } from './options';
import type { BuilderOptions } from './RuleBuilder';

/** The one editor of a block: loaded when it opens. */
const BlockSheet = dynamic(() => import('./BlockSheet').then((m) => m.BlockSheet), { ssr: false });

export default function BlocksPageWrapper() {
  return <Suspense fallback={<div className="page wide-page blocks-page"><div className="page-head"><h1>Segments</h1></div></div>}><BlocksPage /></Suspense>;
}

/** A new block as the editor opens it: the fastest 5 minutes of every run. */
function newBlock(): BlockDefinition {
  return { id: `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name: '', origin: 'manual', status: 'active', createdAt: new Date().toISOString(), params: { type: 'rule', ...ruleOf({ type: 'fastest', kind: 'time', target: 300 }) }, tolerances: { ...RULE_TOLERANCES } };
}

/** What a block's segments come to: how many, in how many runs, the latest. */
interface Tally { segments: number; runs: number; latest: string | null }

/**
 * Blocks, a screen after Runs (the runner's request of 22 Nov 2026: "dodatkowo chce ekran w ktorym
 * mam wszystkie bloki", "osobna sekcja po runs"; requirement "Every block on one screen"): every
 * kept block with the stretch it takes, its segments, the runs they are in and the latest, opened in
 * Analysis or changed in the one editor; the blocks the app found in the runs, to keep or dismiss;
 * a new block made in the same editor (requirement "One way to make a block"); a block deleted from its row.
 */
function BlocksPage() {
  const { folder, handle } = useOpenFolder();
  const params = useSearchParams();
  const router = useRouter();
  const version = useDataVersion();
  const [defs, setDefs] = useState<BlockDefinition[] | null>(null);
  const [instances, setInstances] = useState<BlockInstance[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [options, setOptions] = useState<BuilderOptions | null>(null);
  const [editing, setEditing] = useState<{ def: BlockDefinition; kept: boolean; title: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setDefs((await readDefinitions(folder)).filter((d) => d.status === 'active'));
    setInstances((await readJson<BlockInstancesFile>(folder, PATHS.blockInstances))?.instances ?? []);
    setRecs((await readJson<{ recommendations: Recommendation[] }>(folder, RECOMMENDATIONS_PATH))?.recommendations ?? []);
    setOptions(await builderOptions(folder, (await readJson<RunsIndex>(folder, PATHS.runsIndex))?.runs ?? []));
  }, [folder]);
  useEffect(() => { load().catch(() => setDefs([])); }, [load, version]);

  // ?new=1 (the command palette's New block) opens the editor on a new block.
  const wantsNew = params.get('new') === '1';
  useEffect(() => {
    if (!wantsNew || !options) return;
    setEditing({ def: newBlock(), kept: false, title: 'New segment' });
    router.replace('/segments');
  }, [wantsNew, options, router]);

  const tally = useMemo(() => {
    const out = new Map<string, Tally>();
    for (const i of instances) {
      if (i.status !== 'accepted') continue;
      const t = out.get(i.definitionId) ?? { segments: 0, runs: 0, latest: null };
      t.segments++;
      if (!t.latest || i.runStart > t.latest) t.latest = i.runStart;
      out.set(i.definitionId, t);
    }
    for (const [id, t] of out) t.runs = new Set(instances.filter((i) => i.definitionId === id && i.status === 'accepted').map((i) => i.runId)).size;
    return out;
  }, [instances]);

  /** Writes the definitions as `change` makes them, finds their segments again and reloads. */
  const keep = async (what: string, change: (all: BlockDefinition[]) => BlockDefinition[]) => {
    setBusy(what);
    try {
      await writeDefinitions(folder, change(await readDefinitions(folder)));
      await runInWorker('blocks', handle);
      await load();
    } finally { setBusy(null); }
  };
  const save = (d: BlockDefinition, kept: boolean) => {
    setEditing(null);
    return keep(`${kept ? 'Saving' : 'Adding'} ${d.name}`, (all) => (kept ? all.map((x) => (x.id === d.id ? d : x)) : [...all, d]));
  };
  const remove = (d: BlockDefinition) => { setEditing(null); return keep(`Deleting ${d.name}`, (all) => all.filter((x) => x.id !== d.id)); };
  /** Deleted from its row ("dodaj mozliwosc usuwania moich blokow"), once the runner confirms: its segments go with it; a suggestion it came from returns. */
  const [confirmDialog, confirm] = useConfirm();
  const ask = async (d: BlockDefinition) => { if (await confirm({ title: 'Delete this segment?', message: `“${d.name}” and its efforts go. If it came from a suggestion, the suggestion is offered again.`, confirm: 'Delete', danger: true })) await remove(d); };
  const dismiss = (r: Recommendation) => keep(`Dismissing ${r.name}`, (all) => [...all, fromRecommendation(r, 'rejected')]);

  const stretchOf = (d: BlockDefinition) => shapeName(asRule(d.params, d.tolerances).shape);
  /** The rest of the rule, past its stretch: the runs and conditions it sets. */
  const restOf = (d: BlockDefinition) => {
    const rule = asRule(d.params, d.tolerances);
    const all = ruleName(rule);
    const head = shapeName(rule.shape);
    return all.startsWith(head) ? all.slice(head.length).replace(/^ · /, '') : all === 'All runs' ? '' : all;
  };

  return (
    <div className="page wide-page blocks-page">
      <div className="page-head">
        <h1>Segments</h1>
        <span className="spacer" />
        <button type="button" className="btn primary" disabled={!options} onClick={() => setEditing({ def: newBlock(), kept: false, title: 'New segment' })}>New segment</button>
      </div>
      <p className="muted small blocks-lead">
        A segment is the same part of each of your runs (a route, your best 5 km, every lap of a workout…); each time you ran it is an effort, so you can follow it over time and compare. Make one here, or select a part of a run and press Find similar.
      </p>
      {busy && <p className="muted small" role="status">{busy}…</p>}

      <section className="card blocks-card" aria-label="Your segments">
        <h2>Your segments <span className="muted">· {defs?.length ?? 0}</span></h2>
        {defs === null ? <p className="muted small">Loading…</p> : defs.length === 0 ? (
          <p className="muted small">No segment yet. Press New segment, or select a part of a run and press Find similar.</p>
        ) : (
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Segments">
            <table className="data blocks-table">
              <thead>
                <tr>
                  <th scope="col">Segment</th>
                  <th scope="col">From each run</th>
                  <th scope="col" className="num">Efforts</th>
                  <th scope="col" className="num">Runs</th>
                  <th scope="col">Latest</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {defs.map((d) => {
                  const t = tally.get(d.id);
                  const rest = restOf(d);
                  return (
                    <tr key={d.id}>
                      <td className="strong">{d.name}{rest && d.name !== rest && <span className="muted small block-rest">{rest}</span>}</td>
                      <td>{stretchOf(d)}</td>
                      <td className="num tnum">{t?.segments ?? 0}</td>
                      <td className="num tnum">{t?.runs ?? 0}</td>
                      <td>{t?.latest ? date(t.latest) : <span className="muted">–</span>}</td>
                      <td className="num block-actions">
                        <button type="button" className="btn sm" disabled={!options} onClick={() => setEditing({ def: d, kept: true, title: 'Segment' })} aria-label={`Edit ${d.name}`}>Edit</button>
                        <button type="button" className="btn sm danger" disabled={!!busy} onClick={() => ask(d)} aria-label={`Delete ${d.name}`}>Delete</button>
                        <Link className="row-open" href={`/compare?items=b:${d.id}:0`} aria-label={`${d.name} in Compare`}>Compare →</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {recs.length > 0 && (
        <section className="card blocks-card" aria-label="Suggested segments">
          <h2>Suggested <span className="muted">· found in your runs</span></h2>
          <ul className="suggested">
            {recs.map((r) => (
              <li key={r.id}>
                <div>
                  <b>{r.name}</b>
                  <span className="muted small">{shapeName(asRule(r.params, r.tolerances).shape)} · {r.basis}</span>
                </div>
                <span className="spacer" />
                <button type="button" className="btn sm primary" disabled={!options || !!busy} onClick={() => setEditing({ def: fromRecommendation(r, 'active'), kept: false, title: 'Suggested segment' })} aria-label={`Keep ${r.name}`}>Keep…</button>
                <button type="button" className="btn sm" disabled={!!busy} onClick={() => dismiss(r)} aria-label={`Dismiss ${r.name}`}>Dismiss</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {confirmDialog}
      {editing && options && (
        <BlockSheet def={editing.def} kept={editing.kept} title={editing.title} options={options} handle={handle}
          onClose={() => setEditing(null)} onSave={(d) => save(d, editing.kept)} onDelete={remove} />
      )}
    </div>
  );
}
