'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * The shared pieces of every chart: real-pixel sizing (so text is never stretched), round axis
 * ticks, a scale that ignores outliers, and clock and date formats. Charts follow one look:
 * hairline solid grid and axes, 2px lines, dots with a surface ring, text in text tokens.
 */

/** The width of a container in CSS pixels, following resizes. */
export function useWidth<T extends HTMLElement = HTMLDivElement>(initial = 800): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Round tick values covering [lo, hi]: steps of 1, 2, 2.5 or 5 × 10ⁿ, about `count` of them. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (hi === lo) { hi = lo + 1; lo = lo - 1; }
  const raw = (hi - lo) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

/**
 * Widens [lo, hi] around its middle to at least `minSpan`, so that a difference too small to
 * matter (1.46 against 1.47 m per beat) does not fill the whole chart.
 */
export function ensureSpan(lo: number, hi: number, minSpan = 0): [number, number] {
  if (hi - lo >= minSpan) return [lo, hi];
  const mid = (lo + hi) / 2;
  return [mid - minSpan / 2, mid + minSpan / 2];
}

/** Decimals the labels of these ticks need to differ: 0.005 steps need 3. */
export function tickDecimals(ticks: number[]): number {
  if (ticks.length < 2) return 0;
  const step = Math.abs(ticks[1] - ticks[0]);
  let d = 0;
  while (d < 4 && Math.abs(Math.round(step * 10 ** d) - step * 10 ** d) > 1e-6) d++;
  return d;
}

/** The range of the values between the q and 1 − q quantiles, padded a little: one spike does not flatten the rest. */
export function robustExtent(values: number[], q = 0.02, pad = 0.1): [number, number] {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return [0, 1];
  const lo = s[Math.floor((s.length - 1) * q)];
  const hi = s[Math.ceil((s.length - 1) * (1 - q))];
  const p = (hi - lo) * pad || Math.abs(hi) * 0.05 || 1;
  return [lo - p, hi + p];
}

/** 0:00, 12:30, 1:05:00: seconds as a clock. */
export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

/** Time ticks for an axis of `seconds`: every 1, 2, 5, 10, 15, 20 or 30 minutes, about `count`. */
export function timeTicks(seconds: number, count = 6): number[] {
  const step = [60, 120, 300, 600, 900, 1200, 1800, 3600].find((s) => seconds / s <= count) ?? 3600;
  const out: number[] = [];
  for (let v = 0; v <= seconds; v += step) out.push(v);
  return out;
}

/** Month starts between two times (ms), for a date axis. */
export function monthTicks(t0: number, t1: number): number[] {
  const out: number[] = [];
  const d = new Date(t0);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  for (d.setMonth(d.getMonth() + 1); d.getTime() <= t1; d.setMonth(d.getMonth() + 1)) out.push(d.getTime());
  return out;
}

export const monthLabel = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short' });
export const dayLabel = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** A legend entry: a short line key or a dot in the series colour, the name in text ink. */
export function Key({ color, label, kind = 'line' }: { color: string; label: string; kind?: 'line' | 'dot' }) {
  return (
    <span className="key">
      {kind === 'line' ? <i className="key-line" style={{ background: color }} /> : <i className="key-dot" style={{ background: color }} />}
      {label}
    </span>
  );
}
