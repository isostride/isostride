'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useFolder, useMapTiles } from '@/lib/client';
import { Welcome } from './Welcome';
import { CommandPalette } from './CommandPalette';

type Theme = 'light' | 'dark' | 'system';

const NAV = [
  { href: '/', label: 'Runs', ico: '◷' },
  { href: '/blocks', label: 'Blocks', ico: '▦' },
  { href: '/trend', label: 'Trend', ico: '↗' },
  { href: '/compare', label: 'A/B comparison', ico: '⇄' },
  { href: '/gear', label: 'Gear and tags', ico: '⚙' },
];

/** App Shell: sidebar, top bar, theme; shows the Welcome screen until the data folder is open. */
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
        <button className="brand" style={{ border: 0, background: 'none', textAlign: 'left' }} onClick={() => setCollapsed((c) => !c)} title="Collapse sidebar">
          <span className="brand-mark" />
          {!collapsed && <span>Strideprism</span>}
        </button>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`nav-item ${active(n.href) ? 'active' : ''}`} title={n.label}>
            <span className="ico">{n.ico}</span>
            {!collapsed && <span>{n.label}</span>}
          </Link>
        ))}
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
      <div className="main">
        <header className="topbar">
          <span className="crumbs">▸ <b>{state.folder.name}</b></span>
          <button className="search" style={{ border: 0 }} onClick={() => window.dispatchEvent(new Event('open-palette'))}>⌕ Search runs, blocks… <span className="kbd">⌘K</span></button>
        </header>
        {children}
      </div>
      <CommandPalette onTheme={cycleTheme} />
    </div>
  );
}
