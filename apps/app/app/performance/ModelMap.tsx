'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { msg, t, tn } from '@/lib/i18n';
import type { ModelGroup, ModelKey, ModelReport, Trust } from '@/lib/load';
import { TRUST_LABEL, WhyButton, WhyDialog, shortName, type Models } from './Assumptions';
import { TABS, performanceHref } from './structure';

/** A box of a node, relative to the map. */
interface Box { left: number; right: number; top: number; bottom: number }
interface Edge { from: ModelKey; to: ModelKey; d: string; caps: Trust | null }

/**
 * The lanes, top to bottom: the load, then the response, which turns the load into performance,
 * then the measures of performance it is fitted to. So the response stands between what it links.
 */
const LANES: ModelGroup[] = ['load', 'response', 'aerobic', 'capacity'];
/** The columns: measured from the runs, built on those, fitted to both. */
const COLUMNS = [msg('From your runs'), msg('Built on them'), msg('Fitted response')];
/** The radius of the turns of a line, px. */
const TURN = 12;
const TRUST_ORDER: Trust[] = ['ok', 'rough', 'no', 'nodata'];

/** A model's name on the map: its short name; a fitted response by what it is fitted to. */
const mapName = (m: ModelReport) => (m.group === 'response' ? t('On {model}', { model: m.name.split(' · ')[1] ?? shortName(m) }) : shortName(m));

/** How many models of a lane have a trust: "3 reliable". */
const tallyText = (trust: Trust, n: number): string => {
  switch (trust) {
    case 'ok': return tn(n, '{n} reliable', '{n} reliable');
    case 'rough': return tn(n, '{n} rough', '{n} rough');
    case 'no': return tn(n, '{n} not reliable', '{n} not reliable');
    default: return tn(n, '{n} no data', '{n} no data');
  }
};

/** A path through `pts` turning at each inner point with a rounded corner. */
function rounded(pts: [number, number][]): string {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const r1 = Math.min(TURN, Math.hypot(cx - px, cy - py) / 2);
    const r2 = Math.min(TURN, Math.hypot(nx - cx, ny - cy) / 2);
    d += `L${cx - Math.sign(cx - px) * r1},${cy - Math.sign(cy - py) * r1}Q${cx},${cy} ${cx + Math.sign(nx - cx) * r2},${cy + Math.sign(ny - cy) * r2}`;
  }
  const [lx, ly] = pts[pts.length - 1];
  return `${d}L${lx},${ly}`;
}

/** Where each model sits: its lane, its column and its row in the lane; and the rows of each lane. */
function place(models: ModelReport[]) {
  const by = new Map(models.map((m) => [m.key, m]));
  const level = (m: ModelReport): number => (m.group === 'response' ? 2 : m.parents.some((p) => by.has(p)) ? 1 : 0);
  const spot = new Map<ModelKey, { lane: number; col: number; row: number }>();
  const rows: number[] = [];
  LANES.forEach((g, lane) => {
    const mine = models.filter((m) => m.group === g);
    const taken = [new Set<number>(), new Set<number>(), new Set<number>()];
    const put = (m: ModelReport, col: number, want: number) => {
      let r = want;
      while (taken[col].has(r)) r++;
      taken[col].add(r);
      spot.set(m.key, { lane, col, row: r });
    };
    // What is built on others first, in the order of what they rest on; then each source beside its first child.
    const order = (m: ModelReport) => Math.min(...m.parents.map((p) => models.findIndex((x) => x.key === p)).filter((i) => i >= 0), Infinity);
    mine.filter((m) => level(m) === 1).sort((a, b) => order(a) - order(b)).forEach((m, i) => put(m, 1, i));
    mine.filter((m) => level(m) === 2).forEach((m, i) => put(m, 2, i));
    for (const m of mine.filter((x) => level(x) === 0)) {
      const kids = mine.filter((c) => c.parents.includes(m.key)).map((c) => spot.get(c.key)?.row ?? Infinity);
      put(m, 0, Number.isFinite(Math.min(...kids)) ? Math.min(...kids) : 0);
    }
    rows.push(Math.max(1, ...taken.map((t) => (t.size ? Math.max(...t) + 1 : 0))));
  });
  return { spot, rows };
}

/**
 * The map of the models (requirement "Map of the models"): a lane per kind of evidence, the
 * response between the load and the performance it links; columns from what is measured in the runs
 * to what is built on it and what is fitted to both; a line from each model to every model resting
 * on it, coloured where the model holds the trust of the one resting on it. Each model wears its
 * trust (a bar and a dot in the status colour, and the word), says what it gives now, links to its
 * view, and has its "Why?": the rest about it opens in a window over the screen (requirement
 * "Performance kept simple"). Under the pointer or the focus a model's chain lights up and the rest recede.
 */
export function ModelMap({ models, by: models_, says, byLoad }: { models: ModelReport[]; by: Models; says: (m: ModelReport) => string; /** the models the chosen load model changes, its name and unit */ byLoad?: { set: Set<ModelKey>; name: string; unit: string } }) {
  const inner = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  /** on a wide screen, the height from the top of the map to the bottom of the window: the map fills it */
  const [fill, setFill] = useState<number | null>(null);
  const nodes = useRef(new Map<ModelKey, HTMLDivElement>());
  const [open, setOpen] = useState<ModelKey | null>(null);
  // The reasons opened come into view under the map.
  const [boxes, setBoxes] = useState<Map<ModelKey, Box> | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [active, setActive] = useState<ModelKey | null>(null);
  const by = useMemo(() => new Map(models.map((m) => [m.key, m])), [models]);
  const { spot, rows } = useMemo(() => place(models), [models]);
  // Each lane's rows, a row of 8 px between two lanes so their bands do not touch ("taby load, response,
  // aerobic nakladaja sie ... powinnien byc odstep"): the column titles, then the lanes.
  const laneStart = rows.map((_, i) => 2 + rows.slice(0, i).reduce((s, n) => s + n, 0) + i);
  const gridRows = ['auto', ...rows.flatMap((n, i) => [...Array<string>(n).fill('minmax(min-content, 1fr)'), ...(i < rows.length - 1 ? ['8px'] : [])])].join(' ');

  // On a wide screen the map takes the rest of the window's height (the runner's request: "chce aby
  // zajmowalo pelny ekran na wysokosc"); its rows share it, never less than their content needs.
  useLayoutEffect(() => {
    const fit = () => {
      const el = card.current;
      if (!el || !window.matchMedia('(min-width: 821px)').matches) return setFill(null);
      const top = el.getBoundingClientRect().top + window.scrollY;
      const below = parseFloat(getComputedStyle(el.closest('.page') ?? document.body).paddingBottom) || 0;
      setFill(Math.max(0, Math.floor(window.innerHeight - top - below)));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // Where each node lies, measured after layout and again whenever the map changes size.
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => {
      const o = el.getBoundingClientRect();
      const next = new Map<ModelKey, Box>();
      nodes.current.forEach((n, key) => {
        const r = n.getBoundingClientRect();
        next.set(key, { left: r.left - o.left, right: r.right - o.left, top: r.top - o.top, bottom: r.bottom - o.top });
      });
      setBoxes(next);
      setSize({ w: o.width, h: o.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [models]);

  // The lines: out of the right of a model, along the gutter after its column, into the left of
  // the model resting on it. Lines leaving one column keep apart a little in the gutter.
  const edges = useMemo<Edge[]>(() => {
    if (!boxes) return [];
    const out: Edge[] = [];
    const colEdge = (c: number, side: 'left' | 'right') => {
      const xs = [...spot].filter(([, s]) => s.col === c).map(([k]) => boxes.get(k)?.[side]).filter((v): v is number => v !== undefined);
      return side === 'right' ? Math.max(...xs) : Math.min(...xs);
    };
    const sources = [...new Set(models.flatMap((m) => m.parents.filter((p) => boxes.has(p))))];
    for (const m of models) {
      const c = boxes.get(m.key);
      if (!c) continue;
      for (const p of m.parents) {
        const a = boxes.get(p);
        const sp = spot.get(p);
        if (!a || !sp) continue;
        const sameCol = sources.filter((s) => spot.get(s)?.col === sp.col);
        const k = sameCol.indexOf(p);
        const gx = (colEdge(sp.col, 'right') + colEdge(sp.col + 1, 'left')) / 2 + (k - (sameCol.length - 1) / 2) * 7;
        const ya = (a.top + a.bottom) / 2;
        const yc = (c.top + c.bottom) / 2;
        const pts: [number, number][] = Math.abs(ya - yc) < 1 ? [[a.right, ya], [c.left, yc]] : [[a.right, ya], [gx, ya], [gx, yc], [c.left, yc]];
        out.push({ from: p, to: m.key, d: rounded(pts), caps: m.cappedBy === p ? by.get(p)!.trust : null });
      }
    }
    return out;
  }, [boxes, models, spot, by]);

  // The chain of the model in view: everything it rests on and everything resting on it.
  const chain = useMemo(() => {
    if (!active) return null;
    const set = new Set<ModelKey>([active]);
    const up = (k: ModelKey) => by.get(k)?.parents.forEach((p) => { if (!set.has(p)) { set.add(p); up(p); } });
    const down = (k: ModelKey) => models.forEach((m) => { if (m.parents.includes(k) && !set.has(m.key)) { set.add(m.key); down(m.key); } });
    up(active);
    down(active);
    return set;
  }, [active, by, models]);

  const lane = (g: ModelGroup) => TABS.find((x) => x.key === g)!;
  const tally = (g: ModelGroup) => TRUST_ORDER.map((tr) => [tr, models.filter((m) => m.group === g && m.trust === tr).length] as const).filter(([, n]) => n > 0);
  /** What a lane's evidence is: its words after the colon ("from every run"); the response's, before it. */
  const laneEvidence = (g: ModelGroup) => { const e = lane(g).evidence; return e ? t(e).split(':')[g === 'response' ? 0 : 1]?.trim() : undefined; };

  return (
    <section ref={card} className="card model-map" aria-label={t('Map of the models')} style={fill ? { minHeight: fill } : undefined}>
      <div className="model-map-head">
        <h2>{t('How the models rest on each other')}</h2>
        <p className="muted">{t('Point at a model to light up its chain.')}</p>
        <div className="map-legend muted" aria-hidden="true">
          {TRUST_ORDER.map((tr) => <span key={tr}><i className={`trust-dot ${tr}`} />{t(TRUST_LABEL[tr])}</span>)}
          <span><i className="map-key-line" />{t('rests on')}</span>
          <span><i className="map-key-line caps" />{t('holds back the trust of the next')}</span>
          {byLoad && <span><b className="by-load">{byLoad.unit}</b>{t('follows the load model, {model}', { model: t(byLoad.name) })}</span>}
        </div>
      </div>
      <div className="model-map-scroll">
        <div ref={inner} className="model-map-grid" style={{ gridTemplateRows: gridRows }}>
          {COLUMNS.map((c, i) => <div key={c} className="map-col-title" style={{ gridColumn: 3 + i * 2, gridRow: 1 }}>{t(c)}</div>)}
          {LANES.map((g, i) => (
            <div key={`band-${g}`} className={`map-lane lane-${g}`} style={{ gridColumn: '1 / -1', gridRow: `${laneStart[i]} / span ${rows[i]}` }} aria-hidden="true" />
          ))}
          {LANES.map((g, i) => (
            <div key={`head-${g}`} className="map-lane-head" style={{ gridColumn: 1, gridRow: `${laneStart[i]} / span ${rows[i]}`, '--order': i * 100 } as CSSProperties}>
              <Link href={performanceHref(g)}>{t(lane(g).name)}</Link>
              <span className="muted">{laneEvidence(g)}</span>
              <span className="map-tally">{tally(g).map(([tr, n]) => <span key={tr}><i className={`trust-dot ${tr}`} aria-hidden="true" />{tallyText(tr, n)}</span>)}</span>
            </div>
          ))}
          <svg className="model-map-lines" width={size.w} height={size.h} aria-hidden="true">
            {edges.map((e) => {
              const lit = chain ? chain.has(e.from) && chain.has(e.to) : false;
              return <path key={`${e.from}-${e.to}`} className={`map-edge${e.caps ? ` caps caps-${e.caps}` : ''}${lit ? ' lit' : ''}${chain && !lit ? ' faded' : ''}`} data-from={e.from} data-to={e.to} d={e.d} />;
            })}
          </svg>
          {models.map((m) => {
            const s = spot.get(m.key);
            if (!s) return null;
            return (
              <div key={m.key} ref={(el) => { if (el) nodes.current.set(m.key, el); else nodes.current.delete(m.key); }}
                data-model={m.key} data-trust={m.trust}
                className={`map-node map-${m.trust}${chain && !chain.has(m.key) ? ' faded' : ''}${active === m.key ? ' on' : ''}${open === m.key ? ' why-open' : ''}`}
                style={{ gridColumn: 3 + s.col * 2, gridRow: laneStart[s.lane] + s.row, '--order': s.lane * 100 + 1 + s.col * 10 + s.row } as CSSProperties}
                onMouseEnter={() => setActive(m.key)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(m.key)} onBlur={() => setActive(null)}>
                <Link className="map-link" href={performanceHref(m.where.tab, m.where.view)}>
                  <span className="map-name" title={m.name}>{mapName(m)}</span>
                  <span className="map-now tnum" title={says(m)}>{says(m)}</span>
                </Link>
                <span className="map-side">
                  <span className="map-trust"><i className={`trust-dot ${m.trust}`} aria-hidden="true" />{t(TRUST_LABEL[m.trust])}</span>
                  <span className="map-side-foot">
                    {byLoad?.set.has(m.key) && <span className="by-load" title={t('Changes with the load model: {model}', { model: t(byLoad.name) })}>{byLoad.unit}</span>}
                    <WhyButton m={m} open={open === m.key} onToggle={() => setOpen(open === m.key ? null : m.key)} />
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {open && by.get(open) && <WhyDialog m={by.get(open)!} by={models_} onClose={() => setOpen(null)} />}
    </section>
  );
}
