'use client';

import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { isLocale, isUnits, loadLocale, locale, localeOf, onLocale, setLocale, setUnits, shownKey, units, type Locale, type Units } from '@/lib/i18n';

const MAP_TILES = 'strideprism.mapTiles';

/**
 * The map background setting (requirement "Map background"): OpenStreetMap tiles under a
 * run's route, off by default, kept in this browser; every map follows a change at once.
 */
export function useMapTiles(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const read = () => setOn(localStorage.getItem(MAP_TILES) === 'on');
    read();
    window.addEventListener('map-tiles', read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener('map-tiles', read);
      window.removeEventListener('storage', read);
    };
  }, []);
  const set = (v: boolean) => {
    localStorage.setItem(MAP_TILES, v ? 'on' : 'off');
    window.dispatchEvent(new Event('map-tiles'));
  };
  return [on, set];
}

export type Theme = 'light' | 'dark' | 'system';
const THEME = 'theme';
const applyTheme = (t: Theme) => {
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
};

/**
 * The theme (requirement "Light and dark theme"): light, dark or the system's, kept in this browser
 * (the script in the layout applies it before the first paint); set in Settings or by ⌘K, and every
 * part of the app follows a change at once.
 */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    const read = () => {
      const saved = localStorage.getItem(THEME);
      const t: Theme = saved === 'light' || saved === 'dark' ? saved : 'system';
      setTheme(t);
      applyTheme(t);
    };
    read();
    window.addEventListener('theme', read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener('theme', read);
      window.removeEventListener('storage', read);
    };
  }, []);
  const set = (t: Theme) => {
    localStorage.setItem(THEME, t);
    window.dispatchEvent(new Event('theme'));
  };
  return [theme, set];
}

const NARROW = 'strideprism.narrowMenu';

/**
 * The side menu narrowed to its icons on a wide screen, kept in this browser; set in Settings,
 * Display (it was the logo's press before the logo opened the Data folder screen).
 */
export function useNarrowMenu(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const read = () => setOn(localStorage.getItem(NARROW) === 'on');
    read();
    window.addEventListener('narrow-menu', read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener('narrow-menu', read);
      window.removeEventListener('storage', read);
    };
  }, []);
  const set = (v: boolean) => {
    localStorage.setItem(NARROW, v ? 'on' : 'off');
    window.dispatchEvent(new Event('narrow-menu'));
  };
  return [on, set];
}

/** How the run's chart draws (Settings, Charts): its lines in bands or overlaid, smoothed or raw, its x axis by time or distance, the kept blocks drawn on it. */
export interface ChartSettings {
  layout: 'bands' | 'overlay';
  smooth: boolean;
  axis: 'time' | 'distance';
  blocks: boolean;
  /** on the Over time charts of Compare: the points joined in date order, and the fitted trend line ("lacz punkty, linia trenigu ma byc w settingach") */
  join: boolean;
  trend: boolean;
}
const CHART_KEYS = { layout: 'strideprism.runChartLayout', smooth: 'strideprism.runChartSmooth', axis: 'strideprism.runChartAxis', blocks: 'strideprism.runChartBlocks', join: 'strideprism.overTimeJoin', trend: 'strideprism.overTimeTrend' };
export const DEFAULT_CHART: ChartSettings = { layout: 'bands', smooth: true, axis: 'time', blocks: false, join: true, trend: true };

/** The chart settings kept in this browser (the keys the run screen kept its last choices under). */
export function readChartSettings(): ChartSettings {
  try {
    return {
      layout: localStorage.getItem(CHART_KEYS.layout) === 'overlay' ? 'overlay' : 'bands',
      smooth: localStorage.getItem(CHART_KEYS.smooth) !== 'raw',
      axis: localStorage.getItem(CHART_KEYS.axis) === 'distance' ? 'distance' : 'time',
      blocks: localStorage.getItem(CHART_KEYS.blocks) === 'on',
      join: localStorage.getItem(CHART_KEYS.join) !== 'off',
      trend: localStorage.getItem(CHART_KEYS.trend) !== 'off',
    };
  } catch {
    return DEFAULT_CHART;
  }
}

/**
 * The chart settings (the runner's request of 21 Nov 2026: "ustawienia z charts przenies do settings -
 * charts"): set in Settings, Charts; every chart follows a change at once.
 */
export function useChartSettings(): [ChartSettings, (change: Partial<ChartSettings>) => void] {
  // Read at once in the browser (the screens that use it render there only, once the folder is open): no first frame in the defaults.
  const [chart, setChart] = useState<ChartSettings>(() => (typeof window === 'undefined' ? DEFAULT_CHART : readChartSettings()));
  useEffect(() => {
    const read = () => setChart(readChartSettings());
    read();
    window.addEventListener('chart-settings', read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener('chart-settings', read);
      window.removeEventListener('storage', read);
    };
  }, []);
  const set = (change: Partial<ChartSettings>) => {
    const next = { ...readChartSettings(), ...change };
    try {
      localStorage.setItem(CHART_KEYS.layout, next.layout);
      localStorage.setItem(CHART_KEYS.smooth, next.smooth ? 'smooth' : 'raw');
      localStorage.setItem(CHART_KEYS.axis, next.axis);
      localStorage.setItem(CHART_KEYS.blocks, next.blocks ? 'on' : 'off');
      localStorage.setItem(CHART_KEYS.join, next.join ? 'on' : 'off');
      localStorage.setItem(CHART_KEYS.trend, next.trend ? 'on' : 'off');
    } catch { /* this visit only */ }
    window.dispatchEvent(new Event('chart-settings'));
  };
  return [chart, set];
}

/** The language chosen in this browser (requirement "Language chosen"); the head script of the layout reads it too. */
export const LANGUAGE_KEY = 'isostride.language';

/** The language chosen in this browser, else the first of the browser's languages the app has, else English. */
export function startLocale(): Locale {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch { /* storage blocked */ }
  return localeOf(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

const applyLocale = async (l: Locale) => {
  // Its dictionary first (loaded once, in a script of its own); English has none to load.
  try { await loadLocale(l); } catch { l = 'en'; }
  setLocale(l);
  document.documentElement.lang = l;
  // The page was hidden by the head script until it is in its language (no English flashes first).
  document.documentElement.removeAttribute('data-lang-pending');
};

/**
 * The language and the units in use, as one key (a memo lists it to be made again in them); the
 * component renders again when either changes.
 */
export function useLocale(): string {
  // i18n-ignore: a key of the language and the units, not a text
  return useSyncExternalStore(onLocale, shownKey, () => 'en metric');
}

/** The units chosen in this browser (requirement "Units chosen"). */
export const UNITS_KEY = 'isostride.units';

/** The units chosen in this browser, else metric. */
export function startUnits(): Units {
  try {
    const saved = localStorage.getItem(UNITS_KEY);
    if (isUnits(saved)) return saved;
  } catch { /* storage blocked */ }
  // i18n-ignore: a value of the setting, not a text
  return 'metric';
}

/**
 * Puts the app in its language once, before the first paint after hydration (the static pages are
 * built in English), and follows a choice made in another tab.
 */
export function useStartLocale(): void {
  useLayoutEffect(() => {
    // The units first: they need no loading, and the page shows in them from its first paint in its language.
    setUnits(startUnits());
    void applyLocale(startLocale());
    const other = (e: StorageEvent) => {
      if (e.key === LANGUAGE_KEY) void applyLocale(startLocale());
      if (e.key === UNITS_KEY) setUnits(startUnits());
    };
    window.addEventListener('storage', other);
    return () => window.removeEventListener('storage', other);
  }, []);
}

/** The language and its setter (Settings › Display, the setup wizard): kept in this browser, applied at once. */
export function useLanguage(): [Locale, (l: Locale) => void] {
  useLocale();
  const l = locale();
  const set = (next: Locale) => {
    try { localStorage.setItem(LANGUAGE_KEY, next); } catch { /* storage blocked: for this visit only */ }
    void applyLocale(next);
  };
  return [l, set];
}

/** The units and their setter (Settings › Language & region): kept in this browser, applied at once. */
export function useUnits(): [Units, (u: Units) => void] {
  useLocale();
  const set = (next: Units) => {
    try { localStorage.setItem(UNITS_KEY, next); } catch { /* storage blocked: for this visit only */ }
    setUnits(next);
  };
  return [units(), set];
}
