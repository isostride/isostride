'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useFolder, useMapTiles } from '@/lib/client';
import { Logo } from './Logo';
import { Welcome } from './Welcome';
import { CommandPalette } from './CommandPalette';

type Theme = 'light' | 'dark' | 'system';

/** A 20px stroked icon; the paths are drawn on a 24-unit grid. */
function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split('|').map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

const ICONS = {
  runs: 'M3 12h4l3-8 4 16 3-8h4',
  blocks: 'M4 4h7v7H4z|M13 4h7v7h-7z|M4 13h7v7H4z|M13 13h7v7h-7z',
  analysis: 'M3 17l6-6 4 4 8-8|M14 7h7v7',
  compare: 'M8 3v18|M16 3v18|M3 8l5-5 5 5|M11 16l5 5 5-5',
  ask: 'M21 12a8 8 0 0 1-11.6 7.2L4 21l1.8-5.4A8 8 0 1 1 21 12z|M9.5 9.5a2.5 2.5 0 0 1 5 .5c0 1.5-2.5 2-2.5 3.5|M12 17h.01',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z|M21 21l-4.3-4.3',
};

const NAV = [
  { href: '/', label: 'Runs', ico: ICONS.runs },
  { href: '/blocks', label: 'Blocks', ico: ICONS.blocks },
  { href: '/analysis', label: 'Analysis', ico: ICONS.analysis },
  { href: '/compare', label: 'A/B comparison', ico: ICONS.compare },
  { href: '/gear', label: 'Gear and tags', ico: ICONS.gear },
];

/** App Shell: the sidebar (folder, search, screens, theme) and the page; the Welcome screen until the data folder is open. */
export function Shell({ children }: { children: ReactNode }) {
  const { state } = useFolder();
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<Theme>('system');
  const [mapTiles, setMapTiles] = useMapTiles();

  useEffect(() => {
    const saved = (localStorage.getItem('theme') as Theme | null) ?? 'system';
    setTheme(saved);
  }, []);
  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const cycleTheme = useCallback(() => setTheme((t) => (t === 'light' ? 'dark' : t === 'dark' ? 'system' : 'light')), []);

  if (state.status !== 'open') return <Welcome />;

  const active = (href: string) => (href === '/' ? path === '/' || path.startsWith('/run') : path.startsWith(href));
  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
      <aside className="sidebar">
        <button className="brand" onClick={() => setCollapsed((c) => !c)} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <Logo />
          {!collapsed && <span>Strideprism</span>}
        </button>
        <div className="crumbs" title={`Data folder: ${state.folder.name}`}>
          <Icon d={ICONS.folder} size={15} />
          {!collapsed && <b>{state.folder.name}</b>}
        </div>
        <button className="search" onClick={() => window.dispatchEvent(new Event('open-palette'))} title="Search runs, blocks, screens (⌘K)">
          <Icon d={ICONS.search} size={15} />
          {!collapsed && <><span>Search…</span><span className="kbd">⌘K</span></>}
        </button>
        <nav className="nav" aria-label="Screens">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`nav-item ${active(n.href) ? 'active' : ''}`} title={n.label} aria-current={active(n.href) ? 'page' : undefined}>
              <Icon d={n.ico} />
              {!collapsed && <span>{n.label}</span>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {!collapsed && (
            <div className="segmented" role="radiogroup" aria-label="Theme">
              {(['light', 'dark', 'system'] as Theme[]).map((t) => (
                <button key={t} className={theme === t ? 'on' : ''} onClick={() => setTheme(t)} role="radio" aria-checked={theme === t}>
                  {t === 'light' ? 'Light' : t === 'dark' ? 'Dark' : 'System'}
                </button>
              ))}
            </div>
          )}
          {!collapsed && (
            <label className="setting" title="Map tiles from the OpenStreetMap server: it learns the area of the route shown">
              <input type="checkbox" checked={mapTiles} onChange={(e) => setMapTiles(e.target.checked)} />
              Map background <span className="muted">(online)</span>
            </label>
          )}
        </div>
      </aside>
      <div className="main">{children}</div>
      <CommandPalette onTheme={cycleTheme} />
    </div>
  );
}
