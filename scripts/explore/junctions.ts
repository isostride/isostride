import fs from 'node:fs';
import { parseFit } from '../../lib/ingest/parseFit';
import { resample, projector, distance } from '../../lib/geo/geo';

const dir = 'test_data/coros_fit_2026';
const runs: { id: string; pts: ReturnType<typeof resample> }[] = [];
for (const f of fs.readdirSync(dir).sort()) {
  try {
    const r = parseFit(new Uint8Array(fs.readFileSync(`${dir}/${f}`)));
    runs.push({ id: r.startTime.slice(0, 10), pts: resample(r.samples.lat, r.samples.lon, r.samples.t, 10) });
  } catch {}
}
const proj = projector(41.39);
const CELL = 20;
const sector = (h: number) => Math.round(h / 45) % 8;
const ck = (cx: number, cy: number, s: number) => `${cx},${cy},${s}`;
const cells = new Map<string, Set<number>>();
runs.forEach((r, ri) => {
  for (const p of r.pts) {
    const { x, y } = proj(p);
    const k = ck(Math.floor(x / CELL), Math.floor(y / CELL), sector(p.heading));
    if (!cells.has(k)) cells.set(k, new Set());
    cells.get(k)!.add(ri);
  }
});
function near(p: { lat: number; lon: number; heading: number }): Set<number> {
  const { x, y } = proj(p);
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), s = sector(p.heading);
  const out = new Set<number>();
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const ds of [-1, 0, 1]) {
    const c = cells.get(ck(cx + dx, cy + dy, (s + ds + 8) % 8));
    if (c) for (const r of c) out.add(r);
  }
  return out;
}
const jac = (a: Set<number>, b: Set<number>) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); };
const MIN_RUNS = 5, MIN_LEN = 600, J = 0.7;
type Cand = { seed: number; from: number; to: number; len: number; runs: number; a: any; b: any; heading: number };
const cands: Cand[] = [];
runs.forEach((r, ri) => {
  const S = r.pts.map(near);
  let i0 = 0;
  for (let i = 1; i <= S.length; i++) {
    if (i === S.length || jac(S[i], S[i0]) < J) {
      // segment i0..i-1: runs present all along
      let core = new Set(S[i0]);
      for (let k = i0; k < i; k += 3) core = new Set([...core].filter((x) => S[k].has(x)));
      const len = (i - i0) * 10;
      if (core.size >= MIN_RUNS && len >= MIN_LEN) cands.push({ seed: ri, from: i0, to: i - 1, len, runs: core.size, a: r.pts[i0], b: r.pts[i - 1], heading: r.pts[Math.floor((i0 + i) / 2)].heading });
      i0 = i;
    }
  }
});
// dedupe: same if both ends within 80 m
cands.sort((x, y) => y.runs * y.len - x.runs * x.len);
const kept: Cand[] = [];
for (const c of cands) if (!kept.some((k) => distance(k.a, c.a) < 120 && distance(k.b, c.b) < 120)) kept.push(c);
console.log('candidates', cands.length, 'distinct', kept.length);
for (const k of kept.slice(0, 25)) console.log(`${k.len} m  runs ${k.runs}  heading ${Math.round(k.heading)}  ${k.a.lat.toFixed(5)},${k.a.lon.toFixed(5)} -> ${k.b.lat.toFixed(5)},${k.b.lon.toFixed(5)}  seed ${runs[k.seed].id}`);
