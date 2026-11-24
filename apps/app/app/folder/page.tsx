'use client';

import { useEffect } from 'react';

/**
 * The Data screen's address before it was named Data (the runner's request of 24 Nov 2026: "w jezyku
 * polskim uri jest ciagle /folder"): a link kept from then opens /data, with what it asked (?action=import).
 */
export default function FolderMoved() {
  useEffect(() => { window.location.replace(`/data${window.location.search}`); }, []);
  return null;
}
