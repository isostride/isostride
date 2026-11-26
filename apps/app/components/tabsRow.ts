'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * A row of tabs that scrolls sideways on a phone keeps the chosen tab in view: Performance opened on What
 * if, its sixth tab, showed that tab cut off at the screen's edge (26 Nov 2026). The row alone is
 * scrolled, never the page.
 */
export function useTabInView(chosen: string): RefObject<HTMLDivElement | null> {
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = row.current;
    const tab = el?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!el || !tab || el.scrollWidth <= el.clientWidth) return;
    el.scrollTo({ left: tab.offsetLeft - (el.clientWidth - tab.offsetWidth) / 2 });
  }, [chosen]);
  return row;
}
