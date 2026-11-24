'use client';

import { useEffect, useSyncExternalStore, type ComponentProps, type ComponentType, type JSXElementConstructor, type ReactNode } from 'react';

/**
 * A part of a screen whose script loads apart from the screen's (ADR "Built with React": 220 KB of
 * script per route), shown as soon as it is there. next/dynamic shows such a part through Suspense,
 * and React 19 holds a Suspense boundary's content back for about 300 ms after its fallback; two such
 * parts one inside the other made the Dashboard and Compare wait 0.8 s on their first opening (the
 * runner's "otwarcie dashboardu ... zajmuje czas", "widze ze pojawia sie na liscie po chwili"). Here
 * the script is fetched when the part is first drawn and the part is drawn as soon as it came, by a
 * change of state: no wait but the script's own.
 */
/** Any component, its props kept by ComponentProps. */
export function eager<C extends JSXElementConstructor<any>>(load: () => Promise<C>, fallback?: () => ReactNode): ComponentType<ComponentProps<C>> {
  type P = ComponentProps<C>;
  let loaded: ComponentType<P> | null = null;
  let loading: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const start = () => {
    loading ??= load().then((c) => {
      loaded = c as ComponentType<P>;
      for (const l of listeners) l();
    });
  };
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  function Eager(props: P) {
    const Loaded = useSyncExternalStore(subscribe, () => loaded, () => null);
    useEffect(start, []);
    return Loaded ? <Loaded {...props} /> : <>{fallback?.() ?? null}</>;
  }
  return Eager;
}
