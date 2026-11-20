/**
 * The camera of the route map ("dodaj operacje na mapie ... zoom przesuwanie mapy automatycznie
 * synchronizuje wykres"): a zoom level (fractional, the tiles scaled between their levels) and the
 * centre in world pixels at that level, fitted to a stretch of the route, zoomed around a point,
 * panned, and the range of time of the route in view.
 */

/** Web Mercator: world pixels at a zoom level, as the OpenStreetMap tiles are cut. */
export function mercator(lat: number, lon: number, z: number): [number, number] {
  const n = 256 * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
}

export interface Camera {
  z: number;
  /** the centre of the map in world pixels at zoom z */
  cx: number;
  cy: number;
}

/** A point of the route: latitude, longitude, time (s). */
export type RoutePoint = [number, number, number];

export const MIN_MAP_ZOOM = 1;
export const MAX_MAP_ZOOM = 19;
/** The zoom a fitted map goes up to (a short stretch does not fill the map with one street). */
const FIT_MAX = 17;
const clampZ = (z: number) => Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, z));

/** The camera that shows the points within a map of `size` px with `pad` px around. */
export function fitCamera(pts: RoutePoint[], size: number, pad: number): Camera {
  const lats = pts.map((p) => p[0]);
  const lons = pts.map((p) => p[1]);
  const [x0, y0] = mercator(Math.max(...lats), Math.min(...lons), 0);
  const [x1, y1] = mercator(Math.min(...lats), Math.max(...lons), 0);
  const room = size - 2 * pad;
  const fit = Math.min(x1 - x0 > 0 ? room / (x1 - x0) : Infinity, y1 - y0 > 0 ? room / (y1 - y0) : Infinity);
  const z = Math.min(FIT_MAX, clampZ(Number.isFinite(fit) ? Math.log2(fit) : FIT_MAX));
  const k = 2 ** z;
  return { z, cx: ((x0 + x1) / 2) * k, cy: ((y0 + y1) / 2) * k };
}

/** The camera zoomed by `factor` (above 1: out) around the map point (mx, my), which keeps its place. */
export function zoomCamera(cam: Camera, factor: number, mx: number, my: number, size: number): Camera {
  const z = clampZ(cam.z - Math.log2(factor));
  const s = 2 ** (z - cam.z);
  const wx = cam.cx - size / 2 + mx;
  const wy = cam.cy - size / 2 + my;
  return { z, cx: wx * s - mx + size / 2, cy: wy * s - my + size / 2 };
}

/** The camera moved so the map moves by (dx, dy) map px. */
export const panCamera = (cam: Camera, dx: number, dy: number): Camera => ({ z: cam.z, cx: cam.cx - dx, cy: cam.cy - dy });

/** A route point on the map of this camera, map px. */
export function project(cam: Camera, size: number, lat: number, lon: number): [number, number] {
  const [x, y] = mercator(lat, lon, cam.z);
  return [x - cam.cx + size / 2, y - cam.cy + size / 2];
}

/** The least speed of moving, m/s: slower is standing (and GPS drift). */
const MOVING = 0.8;

/** Whether the runner moved from point i − 1 to point i (metres over seconds, flat-earth near the points). */
function moving(pts: RoutePoint[], i: number): boolean {
  const [la0, lo0, t0] = pts[i - 1];
  const [la1, lo1, t1] = pts[i];
  const dx = (lo1 - lo0) * Math.cos((la0 * Math.PI) / 180) * 111320;
  const dy = (la1 - la0) * 110540;
  return Math.hypot(dx, dy) >= MOVING * Math.max(1, t1 - t0);
}

/**
 * The time range of points a…b trimmed to movement: standing at its start or end, the route stays
 * in view while the time runs on, so the standing is left out.
 */
export function trimStanding(pts: RoutePoint[], a: number, b: number): { from: number; to: number } {
  while (a < b && !moving(pts, a + 1)) a++;
  while (b > a && !moving(pts, b)) b--;
  return { from: pts[a][2], to: pts[b][2] };
}

/**
 * The stretch of the route in view to show on the chart ("fragment trasy na mapie powinien byc
 * pokazywany w calosci na pelnym ekranie wykresu"): the points in view run in one go (on a loop or
 * an out-and-back several such parts can be in view), the part with the point nearest `anchor`
 * (the pointer, or the centre of the map), trimmed of the standing at its ends; null when every point
 * is in view (the whole run) or none is.
 */
export function visibleRange(pts: RoutePoint[], cam: Camera, size: number, anchor: [number, number] = [size / 2, size / 2]): { from: number; to: number } | null {
  const inside = pts.map((p) => { const [x, y] = project(cam, size, p[0], p[1]); return x >= 0 && x <= size && y >= 0 && y <= size ? (x - anchor[0]) ** 2 + (y - anchor[1]) ** 2 : -1; });
  if (inside.every((d) => d >= 0)) return null;
  let best = -1;
  for (let i = 0; i < pts.length; i++) if (inside[i] >= 0 && (best < 0 || inside[i] < inside[best])) best = i;
  if (best < 0) return null;
  // The run of points in view around it.
  let a = best;
  let b = best;
  while (a > 0 && inside[a - 1] >= 0) a--;
  while (b < pts.length - 1 && inside[b + 1] >= 0) b++;
  return trimStanding(pts, a, b);
}
