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
