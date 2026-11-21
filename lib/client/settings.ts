'use client';

import { useEffect, useState } from 'react';

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
}
const CHART_KEYS = { layout: 'strideprism.runChartLayout', smooth: 'strideprism.runChartSmooth', axis: 'strideprism.runChartAxis', blocks: 'strideprism.runChartBlocks' };
export const DEFAULT_CHART: ChartSettings = { layout: 'bands', smooth: true, axis: 'time', blocks: false };

/** The chart settings kept in this browser (the keys the run screen kept its last choices under). */
export function readChartSettings(): ChartSettings {
  try {
    return {
      layout: localStorage.getItem(CHART_KEYS.layout) === 'overlay' ? 'overlay' : 'bands',
      smooth: localStorage.getItem(CHART_KEYS.smooth) !== 'raw',
      axis: localStorage.getItem(CHART_KEYS.axis) === 'distance' ? 'distance' : 'time',
      blocks: localStorage.getItem(CHART_KEYS.blocks) === 'on',
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
    } catch { /* this visit only */ }
    window.dispatchEvent(new Event('chart-settings'));
  };
  return [chart, set];
}
