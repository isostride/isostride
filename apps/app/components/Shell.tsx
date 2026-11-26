'use client';

import { eager } from './eager';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFolder, useLocale, useNarrowMenu, useStartLocale, useTheme } from '@/lib/client';
import { msg, t } from '@/lib/i18n';
import { APP_COMMIT, APP_VERSION, versionLabel } from '@/lib/kernel';
import { Logo } from './Logo';
import { Welcome } from './Welcome';
import { CommandPalette } from './CommandPalette';
import { recordAddress } from './screenTrail';

/** The automatic import, loaded after the screen: it waits for the folder anyway (requirement "New runs imported by themselves"). */
const AutoImport = eager(() => import('./AutoImport').then((m) => m.AutoImport));
/** The facts of the side menu and this week's running: loaded after the screen. */
const SidebarFacts = eager(() => import('./SidebarFacts').then((m) => m.SidebarFacts));
/** Whether the setup wizard opens by itself: looked at after the screen shows, so no screen's script grows. */
const SetupGate = eager(() => import('./SetupGate').then((m) => m.SetupGate));
/** The bar that says the data are the demo's: loaded when the app is on the demo, its place held meanwhile. */
const DemoBar = eager(() => import('./DemoBar').then((m) => m.DemoBar), () => <aside className="demo-bar" aria-hidden="true" />);
/** The splash the logo opens: loaded when it is opened, so no screen's script grows. */
const AboutSplash = eager(() => import('./AboutSplash').then((m) => m.AboutSplash));

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
    <div className="history-nav" role="group" aria-label={t('History')}>
      <button type="button" aria-label={t('Back')} title={t('Back')} disabled={!can.back} onClick={() => history.back()}><Icon d={ICONS.back} size={16} /></button>
      <button type="button" aria-label={t('Forward')} title={t('Forward')} disabled={!can.forward} onClick={() => history.forward()}><Icon d={ICONS.forward} size={16} /></button>
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
  dashboard: 'M3 3h8v10H3z|M13 3h8v6h-8z|M13 11h8v10h-8z|M3 15h8v6H3z',
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
  { href: '/dashboard', label: msg('Dashboard'), ico: ICONS.dashboard },
  { href: '/', label: msg('Runs'), ico: ICONS.runs },
  { href: '/segments', label: msg('Segments'), ico: ICONS.blocks },
  { href: '/compare', label: msg('Compare'), ico: ICONS.analysis },
  { href: '/performance', label: msg('Performance'), ico: ICONS.performance },
  // At the bottom of the side menu ("na sam dol przenies settings").
  { href: '/settings', label: msg('Settings'), ico: ICONS.settings, end: true },
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
 * The logo opens a splash, the app and its version ("klikniecie na logo pokazuje popup z logiem, krotka
 * informacje o aplikacji i numerem wersji ... taki splash"); the folder, its import and its integrations
 * are the first tab of Settings ("menu data pod logiem jest bezsensu .. przesun je cale pod settings");
 * back and forward sit beside the logo.
 */
export function Shell({ children }: { children: ReactNode }) {
  // The app in its language from the first paint (requirement "Language chosen"); the menu follows a change.
  useStartLocale();
  useLocale();
  const { state } = useFolder();
  const path = usePathname();
  const [collapsed] = useNarrowMenu();
  const [theme, setTheme] = useTheme();
  /** a line of facts under each screen of the menu, by its link */
  const [facts, setFacts] = useState<Record<string, string>>({});
  const [splash, setSplash] = useState(false);
  const closeSplash = useCallback(() => setSplash(false), []);

  const cycleTheme = useCallback(() => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'), [theme, setTheme]);

  // COROS's sign-in comes back to a window of its own (app/coros), and the old addresses of the Data
  // screen (app/folder, app/data) only lead on to Settings: none needs the folder.
  if (path.startsWith('/coros') || path.startsWith('/folder') || path.startsWith('/data')) return <>{children}</>;
  if (state.status !== 'open') return <Welcome />;

  const active = (href: string) => (href === '/' ? path === '/' || path.startsWith('/run') : path.startsWith(href));
  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
      <Suspense fallback={null}><ScreenTrail /></Suspense>
      <aside className="sidebar">
        <div className="brand-row">
          <button type="button" className="brand" aria-haspopup="dialog" aria-expanded={splash} title={t('About IsoStride')} onClick={() => setSplash(true)}>
            <Logo size={36} />
            <span className="label brand-text">
              <span className="brand-name">Iso<i className="brand-dot">Stride</i></span>
              <span className="brand-version" title={APP_COMMIT ? t('Version {version}, commit {commit}', { version: APP_VERSION, commit: APP_COMMIT }) : t('Version {version}', { version: APP_VERSION })}>{versionLabel(APP_VERSION)}</span>
            </span>
          </button>
          <HistoryNav />
        </div>
        <button className="search" onClick={() => window.dispatchEvent(new Event('open-palette'))} title={t('Search runs, segments, screens (⌘K)')}>
          <Icon d={ICONS.search} size={15} />
          <span className="label">{t('Search…')}</span><span className="kbd label">⌘K</span>
        </button>
        <nav className="nav" aria-label={t('Screens')}>
          {NAV.map((n) => (
            // Named by the screen alone (its facts hidden from the name); the facts describe it.
            <Link key={n.href} href={n.href} className={`nav-item ${active(n.href) ? 'active' : ''} ${'end' in n ? 'nav-end' : ''}`} title={t(n.label)} aria-describedby={facts[n.href] ? `nav-sub-${n.label}` : undefined} aria-current={active(n.href) ? 'page' : undefined}>
              <Icon d={n.ico} />
              <span className="label nav-text">
                <span>{t(n.label)}</span>
                {/* Its line held from the start, empty until the facts are read, so the menu never moves (layout shift 0). */}
                <small className="nav-sub" id={`nav-sub-${n.label}`} aria-hidden="true">{facts[n.href] ?? '\u00a0'}</small>
              </span>
            </Link>
          ))}
        </nav>
        <SidebarFacts folder={state.folder} path={path} onFacts={setFacts} />
      </aside>
      <div className="main">
        {state.demo && <DemoBar />}
        {children}
      </div>
      <SetupGate folder={state.folder} demo={!!state.demo} />
      <AutoImport />
      <CommandPalette onTheme={cycleTheme} />
      {splash && <AboutSplash onClose={closeSplash} />}
    </div>
  );
}
