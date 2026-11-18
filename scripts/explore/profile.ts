import fs from 'node:fs';
import { parseFit } from '../../lib/ingest/parseFit';
import { resample, projector } from '../../lib/geo/geo';
const dir = 'test_data/coros_fit_2026';
const runs: { id: string; pts: ReturnType<typeof resample> }[] = [];
for (const f of fs.readdirSync(dir).sort()) { try { const r = parseFit(new Uint8Array(fs.readFileSync(`${dir}/${f}`))); runs.push({ id: r.startTime.slice(0, 10), pts: resample(r.samples.lat, r.samples.lon, r.samples.t, 10) }); } catch {} }
const proj = projector(41.39); const CELL = 20; const sector = (h: number) => Math.round(h / 45) % 8;
const ck = (cx: number, cy: number, s: number) => `${cx},${cy},${s}`;
const cells = new Map<string, Set<number>>();
runs.forEach((r, ri) => { for (const p of r.pts) { const { x, y } = proj(p); const k = ck(Math.floor(x / CELL), Math.floor(y / CELL), sector(p.heading)); if (!cells.has(k)) cells.set(k, new Set()); cells.get(k)!.add(ri); } });
function near(p: any) { const { x, y } = proj(p); const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), s = sector(p.heading); const out = new Set<number>(); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const ds of [-1, 0, 1]) { const c = cells.get(ck(cx + dx, cy + dy, (s + ds + 8) % 8)); if (c) for (const r of c) out.add(r); } return out; }
const seed = runs.find((r) => r.id === process.argv[2])!;
let line = '';
seed.pts.forEach((p, i) => { if (i % 10 === 0) { line += `${(i/100).toFixed(1)}km:${near(p).size} ${Math.round(p.heading)}° ${p.lat.toFixed(4)},${p.lon.toFixed(4)}\n`; } });
console.log(line);
