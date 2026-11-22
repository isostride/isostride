'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFolder } from '@/lib/client';
import { readDefinitions } from '@/lib/blocks';
import { PATHS, readJson } from '@/lib/fs';
import type { RunsIndex } from '@/lib/kernel';

type Group = 'Screens' | 'Actions' | 'Runs' | 'Segments';
type Glyph = 'runs' | 'analysis' | 'ab' | 'performance' | 'model' | 'settings' | 'gear' | 'tags' | 'display' | 'block' | 'run' | 'import' | 'theme';

interface Item {
  group: Group;
  label: string;
  /** a second line: what it is, where it leads */
  hint?: string;
  /** a figure on the right (a run's distance) */
  side?: string;
  /** more words it is found by (a run's date in full) */
  keys?: string;
  glyph: Glyph;
  run: () => void;
}

/** The order of the groups, and how many of each show before anything is typed. */
const GROUPS: Group[] = ['Screens', 'Runs', 'Segments', 'Actions'];
const UNTYPED: Record<Group, number> = { Screens: 5, Runs: 5, Segments: 4, Actions: 2 };
const TYPED = 40;

/** The icons of the palette, 24-unit strokes; several paths are separated by "|". */
const GLYPHS: Record<Glyph, string> = {
  runs: 'M3 12h4l3-8 4 16 3-8h4',
  analysis: 'M3 17l6-6 4 4 8-8|M15 7h6v6',
  ab: 'M7 4v16|M17 4v16|M3 8h8|M13 16h8',
  performance: 'M5 18a8 8 0 1 1 14 0|M12 14l4-5',
  model: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z|M12 12l8-4.5|M12 12v9|M12 12L4 7.5',
  settings: 'M4 6h10|M18 6h2|M4 12h4|M12 12h8|M4 18h12|M20 18h0|M14 4v4|M8 10v4|M16 16v4',
  gear: 'M4 15c3 0 4-6 8-6s4 3 8 3v4H4z|M4 19h16',
  tags: 'M3 12V4h8l10 10-8 8z|M7.5 7.5h0',
  display: 'M12 3a9 9 0 1 0 0 18z|M12 3a9 9 0 0 1 0 18',
  block: 'M4 7l8-4 8 4-8 4z|M4 12l8 4 8-4|M4 17l8 4 8-4',
  run: 'M13 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3|M7 21l3-6 3 2v4|M10 15l1-5-3 1-2 3|M11 10l3 2 3-1',
  import: 'M12 4v11|M7 10l5 5 5-5|M5 20h14',
  theme: 'M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z',
};

function Glyph({ g }: { g: Glyph }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {GLYPHS[g].split('|').map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

/** 0:00, 32:57, 1:05:00: seconds as a clock. */
const clock = (sec: number) => { const t = Math.round(sec); const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const r = String(t % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`; };

const Kbd = ({ children }: { children: string }) => <kbd className="cmdk-kbd">{children}</kbd>;

/**
 * ⌘K / Ctrl+K (requirement "Command palette"): jump to a screen or a tab, a block's analysis or
 * A/B comparison, a run, or run an action. Each group has its colour and each item its icon; the
 * runs show their distance; with nothing typed, the screens, the actions and the latest runs and
 * blocks. A combobox over a listbox: the arrows move, Enter opens, Esc closes.
 */
export function CommandPalette({ onTheme }: { onTheme: () => void }) {
  const { state } = useFolder();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') setOpen(false);
    };
    const show = () => setOpen(true);
    window.addEventListener('keydown', key);
    window.addEventListener('open-palette', show);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('open-palette', show);
    };
  }, []);

  useEffect(() => {
    if (!open || state.status !== 'open') return;
    setQ('');
    setActive(0);
    setTimeout(() => input.current?.focus(), 0);
    (async () => {
      const go = (href: string) => () => { setOpen(false); router.push(href); };
      const all: Item[] = [
        // The five screens first: with nothing typed, only they show.
        { group: 'Screens', glyph: 'runs', label: 'Runs', hint: 'Calendar and list of your runs', run: go('/') },
        { group: 'Screens', glyph: 'block', label: 'Segments', hint: 'Every segment, its efforts, new ones', run: go('/segments') },
        { group: 'Screens', glyph: 'analysis', label: 'Compare', hint: 'Trends, efforts, A/B and curves', run: go('/compare') },
        { group: 'Screens', glyph: 'performance', label: 'Performance', hint: 'The map of the models', run: go('/performance') },
        { group: 'Screens', glyph: 'settings', label: 'Settings', hint: 'Zones, gear, tags, display', run: go('/settings') },
        { group: 'Screens', glyph: 'import', label: 'Data folder', hint: 'Import, recompute, another folder', run: go('/folder') },
        { group: 'Screens', glyph: 'ab', label: 'A/B comparison', hint: 'Compare', run: go('/compare?tab=ab') },
        { group: 'Screens', glyph: 'model', label: 'Load model', hint: 'Performance', run: go('/performance?tab=model') },
        { group: 'Screens', glyph: 'tags', label: 'To do for the models', hint: 'Performance', run: go('/performance?tab=todo') },
        { group: 'Screens', glyph: 'gear', label: 'Gear', hint: 'Settings', run: go('/settings?tab=gear') },
        { group: 'Screens', glyph: 'tags', label: 'Tags', hint: 'Settings', run: go('/settings?tab=tags') },
        { group: 'Screens', glyph: 'display', label: 'Display', hint: 'Settings · theme and map background', run: go('/settings?tab=display') },
        { group: 'Actions', glyph: 'import', label: 'Import folder', hint: 'Read the new FIT files of the folder', run: go('/folder?action=import') },
        { group: 'Actions', glyph: 'block', label: 'New segment', hint: 'Segments · which runs, which part of each, which conditions', run: go('/segments?new=1') },
        { group: 'Actions', glyph: 'theme', label: 'Switch theme', hint: 'Light, dark, system', run: () => { onTheme(); } },
      ];
      const runs = (await readJson<RunsIndex>(state.folder, PATHS.runsIndex))?.runs ?? [];
      for (const r of [...runs].reverse()) {
        const d = new Date(r.startTime);
        all.push({
          group: 'Runs', glyph: 'run',
          label: r.title ?? d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
          hint: [r.title ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null, r.workoutType, clock(r.duration), r.avgSpeed ? `${clock(1000 / r.avgSpeed)} /km` : null].filter(Boolean).join(' · '),
          side: `${(r.distance / 1000).toFixed(1)} km`,
          keys: `${r.shoes ?? ''} ${r.startTime.slice(0, 10)} ${d.toLocaleDateString('en', { month: 'long' })} ${d.toLocaleDateString(undefined, { month: 'long', weekday: 'long' })}`,
          run: go(`/run?id=${r.id}`),
        });
      }
      for (const d of (await readDefinitions(state.folder)).filter((x) => x.status === 'active')) {
        all.push({ group: 'Segments', glyph: 'block', label: d.name, hint: 'Segment · Compare', run: go(`/compare?items=b:${d.id}:0`) });
        all.push({ group: 'Segments', glyph: 'ab', label: d.name, hint: 'Segment · Compare A/B', run: go(`/compare?items=b:${d.id}:0&tab=ab&ab=${d.id}`) });
      }
      setItems(all);
    })();
  }, [open, state, router, onTheme]);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = items.filter((i) => words.every((w) => `${i.label} ${i.hint ?? ''} ${i.side ?? ''} ${i.keys ?? ''} ${i.group}`.toLowerCase().includes(w)));
    // Grouped in a fixed order; with nothing typed, a few of each.
    return GROUPS.flatMap((g) => hits.filter((i) => i.group === g).slice(0, words.length ? TYPED : UNTYPED[g])).slice(0, TYPED);
  }, [items, q]);

  // The item in view follows the arrows.
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active]);

  if (!open) return null;
  const count = (g: Group) => shown.filter((i) => i.group === g).length;
  return (
    <div className="palette-backdrop cmdk-backdrop" onClick={() => setOpen(false)}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="cmdk-head">
          <svg className="cmdk-search" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input
            ref={input}
            value={q}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={shown[active] ? `cmdk-${active}` : undefined}
            aria-label="Search runs, segments, screens"
            placeholder="Search runs, segments, screens…"
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              if (e.key === 'Enter' && shown[active]) shown[active].run();
            }}
          />
          <button type="button" className="cmdk-esc" onClick={() => setOpen(false)} aria-label="Close">esc</button>
        </div>
        <div ref={list} className="cmdk-list" id="cmdk-list" role="listbox" aria-label="Results">
          {shown.map((i, k) => (
            <div key={`${i.group}${i.label}${i.hint}${k}`} role="presentation">
              {(k === 0 || shown[k - 1].group !== i.group) && (
                <div className="cmdk-group" role="presentation"><span>{i.group}</span><span className="cmdk-count">{count(i.group)}</span></div>
              )}
              <div id={`cmdk-${k}`} role="option" aria-selected={k === active} className={`cmdk-item group-${i.group.toLowerCase()}`} onMouseMove={() => setActive(k)} onClick={() => i.run()}>
                <span className="cmdk-icon"><Glyph g={i.glyph} /></span>
                <span className="cmdk-text">
                  <span className="cmdk-label">{i.label}</span>
                  {i.hint && <span className="cmdk-hint">{i.hint}</span>}
                </span>
                {i.side && <span className="cmdk-side tnum">{i.side}</span>}
                <span className="cmdk-enter" aria-hidden="true">↵</span>
              </div>
            </div>
          ))}
          {!shown.length && (
            <div className="cmdk-empty">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /><path d="M8.5 11h5" /></svg>
              <b>Nothing found for “{q}”</b>
              <span>Try a date, a run title, a segment or a screen.</span>
            </div>
          )}
        </div>
        <div className="cmdk-foot">
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
          <span><Kbd>↵</Kbd> open</span>
          <span><Kbd>esc</Kbd> close</span>
          <span className="cmdk-foot-end"><Kbd>⌘</Kbd><Kbd>K</Kbd> anywhere</span>
        </div>
      </div>
    </div>
  );
}
