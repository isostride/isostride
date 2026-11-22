'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useFolder, useNarrowMenu, useTheme } from '@/lib/client';
import { Logo } from './Logo';
import { Welcome } from './Welcome';
import { CommandPalette } from './CommandPalette';
import { recordAddress } from './screenTrail';

/** The automatic import, loaded after the screen: it waits for the folder anyway (requirement "New runs imported by themselves"). */
const AutoImport = dynamic(() => import('./AutoImport').then((m) => m.AutoImport), { ssr: false });

/**
 * Back and forward through the screens seen in this tab (the runner's request: "dodaj back/forward
 * buttons"), each usable only when the browser can go that way (the Navigation API, in the
 * Chromium browsers the app runs in; without it both stay usable).
 */
function HistoryNav() {
  const [can, setCan] = useState({ back: true, forward: true });
  useEffect(() => {
    const nav = (window as unknown as { navigation?: EventTarget & { canGoBack: boolean; canGoForward: boolean } }).navigation;
    if (!nav) return;
    const read = () => setCan({ back: nav.canGoBack, forward: nav.canGoForward });
    // The router changes the history inside its insertion effect, where no state may be set: the
    // change is read once that is over.
    let pending = 0;
    const later = () => { cancelAnimationFrame(pending); pending = requestAnimationFrame(read); };
    read();
    nav.addEventListener('currententrychange', later);
    return () => { cancelAnimationFrame(pending); nav.removeEventListener('currententrychange', later); };
  }, []);
  return (
    <div className="history-nav" role="group" aria-label="History">
      <button type="button" aria-label="Back" title="Back" disabled={!can.back} onClick={() => history.back()}><Icon d={ICONS.back} size={16} /></button>
      <button type="button" aria-label="Forward" title="Forward" disabled={!can.forward} onClick={() => history.forward()}><Icon d={ICONS.forward} size={16} /></button>
    </div>
  );
}


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
  analysis: 'M3 17l6-6 4 4 8-8|M14 7h7v7',
  blocks: 'M4 4h7v7H4z|M13 4h7v7h-7z|M4 13h7v7H4z|M13 13h7v7h-7z',
  ask: 'M21 12a8 8 0 0 1-11.6 7.2L4 21l1.8-5.4A8 8 0 1 1 21 12z|M9.5 9.5a2.5 2.5 0 0 1 5 .5c0 1.5-2.5 2-2.5 3.5|M12 17h.01',
  performance: 'M3.5 18a9 9 0 1 1 17 0|M12 14l4-4|M12 14h.01',
  settings: 'M4 21v-7|M4 10V3|M12 21v-9|M12 8V3|M20 21v-5|M20 12V3|M1 14h6|M9 8h6|M17 16h6',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z|M21 21l-4.3-4.3',
  back: 'M15 5l-7 7 7 7',
  forward: 'M9 5l7 7-7 7',
};

const NAV = [
  { href: '/', label: 'Runs', ico: ICONS.runs },
  { href: '/blocks', label: 'Blocks', ico: ICONS.blocks },
  { href: '/analysis', label: 'Analysis', ico: ICONS.analysis },
  { href: '/performance', label: 'Performance', ico: ICONS.performance },
  { href: '/settings', label: 'Settings', ico: ICONS.settings },
];

/** Records each address shown in the tab's trail of screens, for the Run screen's back link. */
function ScreenTrail() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const last = useRef<string | null>(null);
  useEffect(() => {
    const url = `${path}${search ? `?${search}` : ''}`;
    if (url === last.current) return;
    recordAddress(window.sessionStorage, url, last.current);
    last.current = url;
  }, [path, search]);
  return null;
}

/**
 * App Shell: the sidebar (folder, search, screens) and the page; the Welcome screen until the data
 * folder is open. On a phone the same elements are laid out by the stylesheet as a slim top bar
 * (logo, search) and a bottom tab bar of the screens (the author's request of 21 Nov 2026: "layout
 * ma byc responsywny ... mobile devices"). The theme and the map background are set in Settings
 * ("ustawienia schema - light/dark i online/offline przenies do settings"); the shell applies the theme.
 * The logo and the folder's name lead to the Data folder screen (import, recompute, another folder:
 * "pod logiem nie chce popup ale normalna strone"); back and forward sit beside the logo.
 */
export function Shell({ children }: { children: ReactNode }) {
  const { state } = useFolder();
  const path = usePathname();
  const [collapsed] = useNarrowMenu();
  const [theme, setTheme] = useTheme();

  const cycleTheme = useCallback(() => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'), [theme, setTheme]);

  if (state.status !== 'open') return <Welcome />;

  const active = (href: string) => (href === '/' ? path === '/' || path.startsWith('/run') : path.startsWith(href));
  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
      <Suspense fallback={null}><ScreenTrail /></Suspense>
      <aside className="sidebar">
        <div className="brand-row">
          <Link className={`brand ${path.startsWith('/folder') ? 'active' : ''}`} href="/folder" title="Data folder: import, recompute, change" aria-current={path.startsWith('/folder') ? 'page' : undefined}>
            <Logo />
            <span className="label brand-name">stride<i className="brand-dot">.</i>prism</span>
          </Link>
          <HistoryNav />
        </div>
        <Link className="crumbs" href="/folder" title={`Data folder: ${state.folder.name}`}>
          <Icon d={ICONS.folder} size={15} />
          <b className="label">{state.folder.name}</b>
        </Link>
        <button className="search" onClick={() => window.dispatchEvent(new Event('open-palette'))} title="Search runs, blocks, screens (⌘K)">
          <Icon d={ICONS.search} size={15} />
          <span className="label">Search…</span><span className="kbd label">⌘K</span>
        </button>
        <nav className="nav" aria-label="Screens">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`nav-item ${active(n.href) ? 'active' : ''}`} title={n.label} aria-current={active(n.href) ? 'page' : undefined}>
              <Icon d={n.ico} />
              <span className="label">{n.label}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <div className="main">{children}</div>
      <AutoImport />
      <CommandPalette onTheme={cycleTheme} />
    </div>
  );
}
