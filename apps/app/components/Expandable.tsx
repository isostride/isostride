'use client';

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { t } from '@/lib/i18n';
import { keepTabInside } from './focusTrap';

/**
 * Every chart on the whole screen (the runner's "podoba mi sie opcja wykresu full screen i obracania go na telefonie ..
 * che aby kazdy mial taka opcje", 26 Nov 2026), as the run chart is: Expand at the top right of its card, the card made
 * the screen, on a phone turned on its side where the browser can (Chrome on Android, once full screen); where it
 * cannot go full screen (an iPhone) the card covers the page and the runner turns the phone.
 */

/**
 * How much taller than drawn on its screen a chart is drawn on the whole screen: the charts of the card share the room
 * the rest of it leaves (1 on its screen). Each chart registers the height it is drawn at, so the room is shared by them.
 */
interface Room { scale: number; register(h: number): () => void }
const RoomContext = createContext<Room>({ scale: 1, register: () => () => undefined });

/** The height to draw a chart of `height` px at: that height on its screen, its share of the screen when expanded. */
export function useExpandedHeight(height: number): number {
  const { scale, register } = useContext(RoomContext);
  useEffect(() => register(height), [register, height]);
  return Math.round(height * scale);
}

/** useExpandedHeight for a chart drawn by the component that renders its Expandable: read inside the card. */
export function WithExpandedHeight({ height, children }: { height: number; children: (height: number) => ReactNode }) {
  return <>{children(useExpandedHeight(height))}</>;
}

/** The scale of a chart's parts drawn at fixed heights (its panels), 1 on its screen. */
export function useExpandScale(height: number): number {
  return useExpandedHeight(height) / height;
}

/** The least and the most a chart is scaled by on the whole screen: on a phone on its side the card is made to fit. */
const LEAST_SCALE = 0.3;
const MOST_SCALE = 3;

/**
 * The whole screen for an element: full screen where the browser allows, the phone turned on its side where it can;
 * Escape closes it, Tab stays inside it, and the focus goes back to its Expand (marked data-expand) when it closes.
 */
export function useFullScreen(ref: { current: HTMLElement | null }): { full: boolean; open(): void; close(): void } {
  const [full, setFull] = useState(false);
  const open = useCallback(() => {
    setFull(true);
    const lock = () => (screen.orientation as unknown as { lock?: (o: string) => Promise<void> } | undefined)?.lock?.('landscape').catch(() => undefined);
    ref.current?.requestFullscreen?.().then(lock).catch(() => undefined);
  }, [ref]);
  const close = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    setFull(false);
  }, []);
  useEffect(() => {
    if (!full) return;
    const left = () => { if (!document.fullscreenElement) setFull(false); };
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false);
      keepTabInside(e, ref.current);
    };
    document.addEventListener('fullscreenchange', left);
    document.addEventListener('keydown', keys);
    document.documentElement.classList.add('chart-full-open');
    const box = ref.current;
    return () => {
      document.removeEventListener('fullscreenchange', left);
      document.removeEventListener('keydown', keys);
      document.documentElement.classList.remove('chart-full-open');
      try { screen.orientation?.unlock?.(); } catch { /* not locked */ }
      // Back on the button that opened it, once it is drawn again.
      if (document.fullscreenElement && document.fullscreenElement === box) void document.exitFullscreen().catch(() => undefined);
      requestAnimationFrame(() => box?.querySelector<HTMLElement>('[data-expand]')?.focus());
    };
  }, [full, ref]);
  return { full, open, close };
}

/** The icon of the whole screen: its four corners going out; `exit`, coming in (the runner's "zamiast expand daj ikonke full screen", "przy zamkyania ... daj ikonke odwrotna"). */
export function FullScreenIcon({ exit = false }: { exit?: boolean }) {
  const d = exit
    ? ['M8 3v3a2 2 0 0 1-2 2H3', 'M21 8h-3a2 2 0 0 1-2-2V3', 'M3 16h3a2 2 0 0 1 2 2v3', 'M16 21v-3a2 2 0 0 1 2-2h3']
    : ['M8 3H5a2 2 0 0 0-2 2v3', 'M21 8V5a2 2 0 0 0-2-2h-3', 'M3 16v3a2 2 0 0 0 2 2h3', 'M16 21h3a2 2 0 0 0 2-2v-3'];
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d.map((q) => <path key={q} d={q} />)}</svg>;
}

/** Full screen, as the map's and the run chart's: the icon alone, its name told to a screen reader and in its tip. */
export function ExpandButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button type="button" data-expand className={`btn sm chart-expand ${className}`} onClick={onClick} aria-label={t('Expand chart')} title={t('The chart on the whole screen; on a phone, turned on its side')}>
      <FullScreenIcon />
    </button>
  );
}

/** Back from the whole screen: the reverse icon, where the full screen's was; no Close beside it. */
export function CollapseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="btn sm chart-expand" autoFocus onClick={onClick} aria-label={t('Exit full screen')} title={t('Exit full screen (Esc)')}>
      <FullScreenIcon exit />
    </button>
  );
}

/**
 * A card whose charts can take the whole screen: Expand at its top right (left of Pin where the card has one); expanded,
 * the card covers the screen under a bar with its title and Close, its charts as wide as the screen and as tall as
 * the screen leaves them (useExpandedHeight).
 */
export function Expandable({ title, className = '', as: Tag = 'div', label, style, children }: {
  title: string; className?: string;
  /** the element the card is (a tile of the Dashboard is a section, named by `label`) */
  as?: 'div' | 'section'; label?: string; style?: CSSProperties;
  /** its contents; given as a function, they place Expand themselves (a tile, in its head) */
  children: ReactNode | ((expand: ReactNode) => ReactNode);
}) {
  const ref = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const { full, open, close } = useFullScreen(ref);
  const heights = useRef(new Map<number, number>());
  const nextId = useRef(0);
  const [scale, setScale] = useState(1);
  const [measure, setMeasure] = useState(0);
  const register = useCallback((h: number) => {
    const id = nextId.current++;
    heights.current.set(id, h);
    return () => { heights.current.delete(id); };
  }, []);
  // Expanded (or the screen turned): drawn at the heights of its screen, measured, then its charts given what is left.
  useEffect(() => {
    if (!full) { setScale(1); return; }
    const again = () => { setScale(1); setMeasure((m) => m + 1); };
    again();
    addEventListener('resize', again);
    return () => removeEventListener('resize', again);
  }, [full]);
  useLayoutEffect(() => {
    if (!full || !measure) return;
    const el = body.current;
    if (!el) return;
    const total = [...heights.current.values()].reduce((a, b) => a + b, 0);
    if (!total) return;
    const room = el.clientHeight;
    // What its contents take at the heights of their screen: the bottom of the lowest (scrollHeight is never less
    // than the room, so a card shorter than the screen read as one with no room to give).
    const top = el.getBoundingClientRect().top - el.scrollTop;
    const natural = Math.max(el.scrollHeight > room ? el.scrollHeight : 0, ...[...el.children].map((c) => c.getBoundingClientRect().bottom - top));
    setScale(Math.min(MOST_SCALE, Math.max(LEAST_SCALE, 1 + (room - natural) / total)));
  }, [full, measure]);
  const value = useMemo<Room>(() => ({ scale, register }), [scale, register]);
  const expand = full ? null : <ExpandButton onClick={open} className={typeof children === 'function' ? '' : 'expand-corner'} />;
  return (
    <Tag ref={ref as RefObject<HTMLDivElement>} className={`${className} expandable ${full ? 'expanded' : ''}`} style={style} role={full ? 'dialog' : undefined} aria-modal={full || undefined} aria-label={full ? t('{chart}, expanded', { chart: title }) : label}>
      {full && (
        <div className="expand-head">
          <b>{title}</b>
          <span className="spacer" />
          <CollapseButton onClick={close} />
        </div>
      )}
      {typeof children !== 'function' && expand}
      {/* One element whether expanded or not (its contents stay mounted, their state kept); on its screen it takes no box of its own. */}
      <RoomContext.Provider value={value}>
        <div ref={body} className="expand-body">{typeof children === 'function' ? children(expand) : children}</div>
      </RoomContext.Provider>
    </Tag>
  );
}
