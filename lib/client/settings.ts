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
