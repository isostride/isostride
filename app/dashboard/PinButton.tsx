'use client';

import { useEffect, useState } from 'react';
import { addTile, hasTile, readDashboard, removeTile, writeDashboard, type TileKind } from '@/lib/dashboard';
import type { DataFolder } from '@/lib/fs';

/**
 * Pin to the Dashboard, in the corner of a card (the runner's "Pin na kazdej karcie-widgecie" and
 * "nie kazdy tekst ... tylko pin na poziomie widgetu"): adds the widget to the Dashboard with its
 * name and how it is set, or takes it off again; pressed while it is there.
 */
export function PinButton({ folder, kind, target: id, name, opts }: { folder: DataFolder; kind: TileKind; target: string; name: string; opts?: string }) {
  const [pinned, setPinned] = useState<boolean | null>(null);
  useEffect(() => { readDashboard(folder).then((t) => setPinned(hasTile(t, kind, id))).catch(() => setPinned(false)); }, [folder, kind, id]);
  const toggle = async () => {
    const tiles = await readDashboard(folder);
    const on = hasTile(tiles, kind, id);
    await writeDashboard(folder, on ? removeTile(tiles, tiles.find((t) => t.kind === kind && t.ref === id)!.id) : addTile(tiles, kind, id, { name, opts }));
    setPinned(!on);
  };
  return (
    <button type="button" className={`pin-btn${pinned ? ' pinned' : ''}`} disabled={pinned === null} aria-pressed={!!pinned} aria-label={`Pin ${name} to the dashboard`}
      title={pinned ? 'On the Dashboard: press to take it off' : 'Pin to the Dashboard'} onClick={toggle}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M9 3h6l-1 6 4 4v2h-5v6l-1 1-1-1v-6H6v-2l4-4z" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
