'use client';

import { useEffect } from 'react';

/**
 * The Data screen's first address (the runner's request of 24 Nov 2026: "w jezyku polskim uri jest
 * ciagle /folder"), then /data, now the first tab of Settings ("przesun je cale pod settings ... jako
 * pierwzza zakladka"): a link kept from then opens Settings, on that tab.
 */
export default function FolderMoved() {
  useEffect(() => { window.location.replace('/settings'); }, []);
  return null;
}
