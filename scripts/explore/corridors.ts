import fs from 'node:fs';
import { parseFit } from '../../lib/ingest/parseFit';
import { resample, projector, angleBetween } from '../../lib/geo/geo';

const dir = 'test_data/coros_fit_2026';
const runs: { id: string; pts: ReturnType<typeof resample> }[] = [];
for (const f of fs.readdirSync(dir).sort()) {
  try {
    const r = parseFit(new Uint8Array(fs.readFileSync(`${dir}/${f}`)));
    runs.push({ id: r.startTime.slice(0, 10), pts: resample(r.samples.lat, r.samples.lon, r.samples.t, 10) });
  } catch {}
}
const proj = projector(41.39);
const CELL = 25;
const key = (x: number, y: number, s: number) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${s}`;
const sector = (h: number) => Math.round(h / 45) % 8;
const cells = new Map<string, Set<number>>();
runs.forEach((r, ri) => {
  for (const p of r.pts) {
    const { x, y } = proj(p);
    const k = key(x, y, sector(p.heading));
    if (!cells.has(k)) cells.set(k, new Set());
    cells.get(k)!.add(ri);
  }
});
// For each run, stretches where the cell has >= N runs.
for (const N of [5, 10, 20]) {
  const lens: number[] = [];
  for (const r of runs) {
    let start = -1;
    for (let i = 0; i <= r.pts.length; i++) {
      const p = r.pts[i];
      const ok = p && (cells.get(key(proj(p).x, proj(p).y, sector(p.heading)))?.size ?? 0) >= N;
      if (ok && start < 0) start = i;
      if (!ok && start >= 0) { lens.push((i - start) * 10); start = -1; }
    }
  }
  lens.sort((a, b) => b - a);
  console.log(`N>=${N}: stretches`, lens.length, 'longest', lens.slice(0, 15).join(' '), 'median', lens[Math.floor(lens.length / 2)]);
}
console.log('runs', runs.length, 'cells', cells.size, 'max runs in a cell', Math.max(...[...cells.values()].map((s) => s.size)));
// Bounding boxes of very popular cells
const top = [...cells.entries()].filter(([, s]) => s.size >= 30).map(([k]) => k.split(',').map(Number));
console.log('cells with >=30 runs', top.length);
