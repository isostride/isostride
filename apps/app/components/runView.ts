/**
 * The view of a run kept in its link ("chce aby wszystko bylo endkodowane w url"): the range shown
 * (the selection), the metrics in their colour slots, the metric whose scale shows, the lines, the
 * x axis, the smoothing, the blocks drawn and the camera of a map moved by hand.
 */

export interface MapCamera {
  z: number;
  cx: number;
  cy: number;
}

export interface RunView {
  /** the range shown, s; null: the whole run */
  range: [number, number] | null;
  /** the metric of each colour slot, null for an empty slot */
  slots: (string | null)[];
  /** the metric whose scale shows; null: the first one shown */
  focus: string | null;
  layout: 'bands' | 'overlay';
  axis: 'time' | 'distance';
  smooth: boolean;
  blocks: boolean;
  /** the map moved by hand; null: it follows the chart */
  map: MapCamera | null;
}

const num = (s: string | null) => (s === null || s.trim() === '' ? NaN : Number(s));

/**
 * The view a link gives, over `base` for what the link leaves out; `keys` are the metrics there are,
 * a value that does not read is left out (the base's stays).
 */
export function viewFromParams(p: URLSearchParams, base: RunView, keys: { has: (key: string) => boolean }): RunView {
  const v: RunView = { ...base, slots: [...base.slots] };
  const from = num(p.get('from'));
  const to = num(p.get('to'));
  if (from >= 0 && to > from) v.range = [from, to];
  const m = p.get('m');
  if (m !== null) {
    const slots = m.split(',').map((k) => (keys.has(k) ? k : null));
    if (slots.length === base.slots.length) v.slots = slots;
  }
  const f = p.get('f');
  if (f !== null && keys.has(f)) v.focus = f;
  const l = p.get('l');
  if (l === 'bands' || l === 'overlay') v.layout = l;
  const x = p.get('x');
  if (x === 'time' || x === 'distance') v.axis = x;
  const s = p.get('s');
  if (s === 'smooth' || s === 'raw') v.smooth = s === 'smooth';
  const b = p.get('b');
  if (b === '1' || b === '0') v.blocks = b === '1';
  const map = p.get('map')?.split(',').map(Number);
  if (map && map.length === 3 && map.every(Number.isFinite)) v.map = { z: map[0], cx: map[1], cy: map[2] };
  return v;
}

/** The link's query of a view: every part of it, the map only when moved by hand. */
export function viewToParams(id: string, v: RunView): URLSearchParams {
  const p = new URLSearchParams({ id });
  if (v.range) { p.set('from', String(Math.round(v.range[0] * 10) / 10)); p.set('to', String(Math.round(v.range[1] * 10) / 10)); }
  p.set('m', v.slots.map((k) => k ?? '_').join(','));
  if (v.focus) p.set('f', v.focus);
  p.set('l', v.layout);
  p.set('x', v.axis);
  p.set('s', v.smooth ? 'smooth' : 'raw');
  p.set('b', v.blocks ? '1' : '0');
  if (v.map) p.set('map', [v.map.z.toFixed(3), v.map.cx.toFixed(1), v.map.cy.toFixed(1)].join(','));
  return p;
}

/**
 * Layers of a link, the first having a part winning: the link opened, then the run's memory. The
 * range's two ends go together.
 */
export function mergeParams(...layers: (URLSearchParams | null)[]): URLSearchParams {
  const out = new URLSearchParams();
  const has = (p: URLSearchParams, k: string) => (k === 'range' ? p.has('from') && p.has('to') : p.has(k));
  for (const k of ['id', 'range', 'm', 'f', 'l', 'x', 's', 'b', 'map']) {
    const layer = layers.find((p): p is URLSearchParams => !!p && has(p, k));
    if (!layer) continue;
    if (k === 'range') { out.set('from', layer.get('from')!); out.set('to', layer.get('to')!); } else out.set(k, layer.get(k)!);
  }
  return out;
}
