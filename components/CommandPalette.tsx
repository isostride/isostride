'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFolder } from '@/lib/client';
import { readDefinitions } from '@/lib/blocks';
import { PATHS, readJson } from '@/lib/fs';
import type { RunsIndex } from '@/lib/kernel';

interface Item {
  group: 'Screens' | 'Blocks' | 'Runs' | 'Actions';
  label: string;
  hint?: string;
  run: () => void;
}

/** ⌘K / Ctrl+K: jump to a screen, a block's trend or A/B comparison, a run, or run an action. */
export function CommandPalette({ onTheme }: { onTheme: () => void }) {
  const { state } = useFolder();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const input = useRef<HTMLInputElement>(null);

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
      const list: Item[] = [
        { group: 'Screens', label: 'Runs', run: go('/') },
        { group: 'Screens', label: 'Analysis', run: go('/analysis') },
        { group: 'Screens', label: 'A/B comparison', run: go('/compare') },
        { group: 'Screens', label: 'Gear and tags', run: go('/gear') },
      ];
      for (const d of (await readDefinitions(state.folder)).filter((x) => x.status === 'active')) {
        list.push({ group: 'Blocks', label: `${d.name} · Analysis`, run: go(`/analysis?items=b:${d.id}:0`) });
        list.push({ group: 'Blocks', label: `${d.name} · Compare A/B`, run: go(`/compare?def=${d.id}`) });
      }
      const runs = (await readJson<RunsIndex>(state.folder, PATHS.runsIndex))?.runs ?? [];
      for (const r of [...runs].reverse()) {
        const d = new Date(r.startTime);
        list.push({
          group: 'Runs',
          label: `${r.title ? `${r.title} · ` : ''}${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · ${(r.distance / 1000).toFixed(1)} km`,
          hint: [r.workoutType, r.shoes, r.startTime.slice(0, 10)].filter(Boolean).join(' · '),
          run: go(`/run?id=${r.id}`),
        });
      }
      list.push({ group: 'Actions', label: 'Import folder', run: go('/?action=import') });
      list.push({ group: 'Actions', label: 'Toggle theme (Light / Dark / System)', run: () => { onTheme(); } });
      setItems(list);
    })();
  }, [open, state, router, onTheme]);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((i) => words.every((w) => `${i.label} ${i.hint ?? ''} ${i.group}`.toLowerCase().includes(w))).slice(0, 40);
  }, [items, q]);

  if (!open) return null;
  return (
    <div className="palette-backdrop" onClick={() => setOpen(false)}>
      <div className="palette" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <input
          ref={input}
          value={q}
          placeholder="Search runs, blocks, screens…"
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === 'Enter' && shown[active]) shown[active].run();
          }}
        />
        <div className="palette-list">
          {shown.map((i, k) => (
            <div key={`${i.group}${i.label}${k}`}>
              {(k === 0 || shown[k - 1].group !== i.group) && <div className="palette-group">{i.group}</div>}
              <div className={`palette-item ${k === active ? 'on' : ''}`} onMouseEnter={() => setActive(k)} onClick={() => i.run()}>
                <span>{i.label}</span>
                {i.hint && <span className="muted small">{i.hint}</span>}
              </div>
            </div>
          ))}
          {!shown.length && <div className="muted small" style={{ padding: 12 }}>Nothing found.</div>}
        </div>
        <div className="muted small" style={{ padding: '6px 12px', borderTop: '1px solid var(--border)' }}>↑↓ navigate · ↵ open · esc close</div>
      </div>
    </div>
  );
}
