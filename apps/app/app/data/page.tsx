'use client';

import { useEffect } from 'react';

/**
 * The Data screen's address before it became the first tab of Settings (the runner's request of
 * 24 Nov 2026: "menu data pod logiem jest bezsensu .. przesun je cale pod settings ... jako pierwzza
 * zakladka"): a link kept from then opens Settings, on that tab.
 */
export default function DataMoved() {
  useEffect(() => { window.location.replace('/settings'); }, []);
  return null;
}
