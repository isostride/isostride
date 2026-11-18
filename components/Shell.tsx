'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useFolder } from '@/lib/client/folderContext';
import { Welcome } from './Welcome';

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

  useEffect(() => {
    const saved = (localStorage.getItem('theme') as Theme | null) ?? 'system';
    setTheme(saved);
  }, []);
  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

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
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <span className="crumbs">▸ <b>{state.folder.name}</b></span>
          <div className="search">⌕ Search runs, blocks… <span className="kbd">⌘K</span></div>
        </header>
        {children}
      </div>
    </div>
  );
}
