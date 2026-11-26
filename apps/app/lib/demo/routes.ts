/**
 * Where the demo runner runs: made-up paths in and around a large park, drawn as smooth curves through a
 * few points, metres east and north of a place. They are shapes, not surveyed paths: over a map
 * background they lie near the park, not on its paths.
 */

export type PathName = 'perimeter' | 'inner' | 'track' | 'river' | 'hill' | 'promenade';

interface Path {
  /** m: of the loop, or from end to end */
  length: number;
  closed: boolean;
  /** latitude and longitude of the point the metres are counted from */
  place: [number, number];
  /** metres east and north, at a distance along the path */
  at(d: number): [number, number];
  /** altitude, m */
  alt(d: number): number;
}

/** The spacing of the points a path is kept as, m. */
const STEP = 4;

/** A smooth curve through the points (Catmull and Rom), scaled about its first point to the length asked. */
function curve(points: [number, number][], closed: boolean, length: number): { xs: Float64Array; ys: Float64Array; length: number } {
  const n = points.length;
  const p = (i: number) => (closed ? points[((i % n) + n) % n] : points[Math.min(n - 1, Math.max(0, i))]);
  const dense: [number, number][] = [];
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    const [a, b, c, d] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    for (let k = 0; k < 40; k++) {
      const t = k / 40;
      const f = (j: 0 | 1) => 0.5 * (2 * b[j] + (c[j] - a[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t * t + (3 * b[j] - a[j] - 3 * c[j] + d[j]) * t * t * t);
      dense.push([f(0), f(1)]);
    }
  }
  dense.push(closed ? dense[0] : points[n - 1]);
  const along = [0];
  for (let i = 1; i < dense.length; i++) along.push(along[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const scale = length / along[along.length - 1];
  const [ox, oy] = dense[0];
  const count = Math.floor(length / STEP) + 1;
  const xs = new Float64Array(count + 1);
  const ys = new Float64Array(count + 1);
  let j = 0;
  for (let i = 0; i <= count; i++) {
    const d = Math.min(length, i * STEP) / scale;
    while (j < along.length - 2 && along[j + 1] < d) j++;
    const f = along[j + 1] > along[j] ? (d - along[j]) / (along[j + 1] - along[j]) : 0;
    xs[i] = ox + (dense[j][0] + (dense[j + 1][0] - dense[j][0]) * f - ox) * scale;
    ys[i] = oy + (dense[j][1] + (dense[j + 1][1] - dense[j][1]) * f - oy) * scale;
  }
  return { xs, ys, length };
}

function path(points: [number, number][], closed: boolean, length: number, alt: (d: number) => number, place: [number, number]): Path {
  const c = curve(points, closed, length);
  const last = c.xs.length - 1;
  return {
    length,
    closed,
    place,
    alt: (d) => alt(closed ? ((d % length) + length) % length : Math.min(length, Math.max(0, d))),
    at(d) {
      const s = closed ? ((d % length) + length) % length : Math.min(length, Math.max(0, d));
      const i = Math.min(last - 1, Math.floor(s / STEP));
      const f = Math.min(1, (s - i * STEP) / STEP);
      return [c.xs[i] + (c.xs[i + 1] - c.xs[i]) * f, c.ys[i] + (c.ys[i + 1] - c.ys[i]) * f];
    },
  };
}

/** The park the runner trains in, and the seaside of the holidays. */
const PARK: [number, number] = [52.4735, 13.4015];
const SEASIDE: [number, number] = [36.7196, -4.37];
/** The gate of the park: the loops of the park and the path along the river start here. */
const GATE: [number, number] = [-950, -420];

/** The 400 m track beside the park: two straights and two half circles. */
function trackPath(): Path {
  const straight = 84.39; const radius = 36.5; const turn = 0.2; const ox = -250; const oy = 980;
  const length = 2 * straight + 2 * Math.PI * radius;
  return {
    length,
    closed: true,
    place: PARK,
    alt: () => 47,
    at(d) {
      let s = ((d % length) + length) % length;
      let x: number; let y: number;
      if (s < straight) { x = s - straight / 2; y = -radius; }
      else if (s < straight + Math.PI * radius) { const a = (s - straight) / radius - Math.PI / 2; x = straight / 2 + radius * Math.cos(a); y = radius * Math.sin(a); }
      else if (s < 2 * straight + Math.PI * radius) { s -= straight + Math.PI * radius; x = straight / 2 - s; y = radius; }
      else { const a = (s - 2 * straight - Math.PI * radius) / radius + Math.PI / 2; x = -straight / 2 + radius * Math.cos(a); y = radius * Math.sin(a); }
      const c = Math.cos(turn); const sn = Math.sin(turn);
      return [ox + x * c - y * sn, oy + x * sn + y * c];
    },
  };
}

/** The climb of the hill loop: its first 300 m rise 19 m, a flat top, then a long way down. */
const HILL_CLIMB = 300;
function hillAlt(d: number): number {
  const smooth = (x: number) => x * x * (3 - 2 * x);
  if (d <= HILL_CLIMB) return 52 + 19 * smooth(d / HILL_CLIMB);
  if (d <= 480) return 71;
  return 71 - 19 * smooth((d - 480) / (1500 - 480));
}

const BUILD: Record<PathName, () => Path> = {
  /** around the park, 6 km, a rise of 6 m on its far side */
  perimeter: () => path([GATE, [-600, -640], [0, -690], [650, -640], [1000, -380], [1030, 120], [820, 520], [300, 640], [-350, 660], [-850, 520], [-1050, 80]], true, 6000,
    (d) => 46 + 3 * (1 - Math.cos((2 * Math.PI * d) / 6000)) + 0.8 * Math.sin((2 * Math.PI * d) / 1500), PARK),
  /** the shorter loop inside it, 4 km */
  inner: () => path([GATE, [-500, -480], [100, -430], [600, -300], [640, 60], [300, 330], [-250, 380], [-700, 250], [-900, -80]], true, 4000,
    (d) => 46 + 1.5 * (1 - Math.cos((2 * Math.PI * d) / 4000)), PARK),
  track: trackPath,
  /** along the river from the gate, 14 km one way, two bridges on it */
  river: () => path([GATE, [-1500, -900], [-2300, -1100], [-3200, -1700], [-4300, -1900], [-5200, -2600], [-6400, -2800], [-7400, -3500], [-8600, -3700], [-9700, -4400], [-10900, -4700], [-12000, -5300]], false, 14000,
    (d) => 44 - d / 3500 + 1.2 * Math.sin(d / 420) + 4 * Math.exp(-(((d - 3600) / 90) ** 2)) + 4 * Math.exp(-(((d - 8300) / 90) ** 2)), PARK),
  /** the loop over the hill north of the park, 1.5 km */
  hill: () => path([[300, 1250], [420, 1500], [650, 1640], [900, 1560], [980, 1330], [840, 1150], [560, 1120]], true, 1500, hillAlt, PARK),
  /** the promenade of the holidays, 9 km one way */
  promenade: () => path([[0, 0], [900, 260], [1900, 380], [2900, 640], [3900, 760], [4900, 1050], [5800, 1200]], false, 9000, (d) => 4 + 0.6 * Math.sin(d / 300), SEASIDE),
};

const built: Partial<Record<PathName, Path>> = {};
const pathOf = (name: PathName): Path => (built[name] ??= BUILD[name]());

/** A stretch of a run's way: along a path from a distance on it, forwards or back, for a length. */
export interface Leg {
  path: PathName;
  /** m along the path where the leg starts */
  from: number;
  dir: 1 | -1;
  /** m */
  length: number;
}

/** Where a run is at a distance run, and how high: the legs one after another, the last one carried on past its end. */
export interface Course {
  place: [number, number];
  at(d: number): [number, number];
  alt(d: number): number;
}

export function courseOf(legs: Leg[]): Course {
  const starts: number[] = [];
  let total = 0;
  for (const l of legs) { starts.push(total); total += l.length; }
  const on = (d: number): [Path, number] => {
    let i = legs.length - 1;
    while (i > 0 && d < starts[i]) i--;
    const l = legs[i];
    return [pathOf(l.path), l.from + l.dir * (d - starts[i])];
  };
  return {
    place: pathOf(legs[0].path).place,
    at(d) { const [p, s] = on(d); return p.at(s); },
    alt(d) { const [p, s] = on(d); return p.alt(s); },
  };
}

/** Laps of a loop of the park, from the gate. */
export const laps = (name: 'perimeter' | 'inner' | 'track' | 'hill', count: number): Leg => ({ path: name, from: 0, dir: 1, length: count * pathOf(name).length });

/**
 * Out along a path and back the same way, `total` m in all; a run longer than that (a few hundred metres added to a
 * long run) goes out again past the start, not on the spot at its end (an open path stops there).
 */
export const outAndBack = (name: 'river' | 'promenade', total: number): Leg[] => [{ path: name, from: 0, dir: 1, length: total / 2 }, { path: name, from: total / 2, dir: -1, length: total / 2 }, { path: name, from: 0, dir: 1, length: 2000 }];

/** The loops of the park that make a distance (an even number of km, 6 or more): 4 km and 6 km loops from the gate, the short ones first or last. */
export function parkLegs(km: number, shortFirst: boolean): Leg[] {
  let six = Math.floor(km / 6);
  const rest = km - six * 6;
  let four = rest >= 4 ? 1 : 0;
  if (rest === 2 && six > 0) { six -= 1; four = 2; }
  const legs: Leg[] = [];
  if (four) legs.push(laps('inner', four));
  if (six) legs.push(laps('perimeter', six));
  if (!shortFirst) legs.reverse();
  // Past the distance planned the last loop is carried on.
  return legs.length ? legs : [laps('perimeter', 1)];
}

/** Up the climb of the hill loop and back down it, `count` times, after `loops` of the loop. */
export function hillLegs(loops: number, count: number): Leg[] {
  const legs: Leg[] = [laps('hill', loops)];
  for (let i = 0; i < count; i++) legs.push({ path: 'hill', from: 0, dir: 1, length: HILL_CLIMB }, { path: 'hill', from: HILL_CLIMB, dir: -1, length: HILL_CLIMB });
  legs.push(laps('hill', 4));
  return legs;
}

/** The length of the climb the hill repetitions go up, m. */
export const CLIMB = HILL_CLIMB;
/** The length of the hill loop, m. */
export const HILL_LOOP = 1500;

/** Latitude and longitude of a point given in metres east and north of a place. */
export function toLatLon(place: [number, number], x: number, y: number): [number, number] {
  return [place[0] + y / 111_320, place[1] + x / (111_320 * Math.cos((place[0] * Math.PI) / 180))];
}
