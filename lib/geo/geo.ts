/** Small geodesy helpers for GPS tracks (WGS84, short distances). */

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export interface Point {
  lat: number;
  lon: number;
}

/** Great-circle distance in metres. */
export function distance(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b, degrees clockwise from north, 0..360. */
export function bearing(a: Point, b: Point): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Smallest angle between two bearings, 0..180. */
export function angleBetween(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** A point of a track resampled by distance, with the sample index and time it came from. */
export interface TrackPoint extends Point {
  /** distance along the track, m */
  d: number;
  /** seconds since the start of the run */
  t: number;
  /** bearing of travel at this point, degrees */
  heading: number;
}

/**
 * Resamples a run's GPS points every `step` metres along the track, by linear
 * interpolation between samples; null positions are skipped.
 */
export function resample(lat: (number | null)[], lon: (number | null)[], t: number[], step = 10): TrackPoint[] {
  const pts: { p: Point; t: number }[] = [];
  for (let i = 0; i < lat.length; i++) if (lat[i] !== null && lon[i] !== null) pts.push({ p: { lat: lat[i]!, lon: lon[i]! }, t: t[i] });
  const out: TrackPoint[] = [];
  if (pts.length < 2) return out;
  let along = 0;
  let next = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = distance(a.p, b.p);
    if (seg <= 0) continue;
    const hd = bearing(a.p, b.p);
    while (next <= along + seg) {
      const f = (next - along) / seg;
      out.push({ lat: a.p.lat + (b.p.lat - a.p.lat) * f, lon: a.p.lon + (b.p.lon - a.p.lon) * f, d: next, t: a.t + (b.t - a.t) * f, heading: hd });
      next += step;
    }
    along += seg;
  }
  return out;
}

/** A local planar projection around a reference latitude: metres east and north. */
export function projector(lat0: number) {
  const kx = Math.cos(rad(lat0)) * ((Math.PI * R) / 180);
  const ky = (Math.PI * R) / 180;
  return (p: Point) => ({ x: p.lon * kx, y: p.lat * ky });
}
