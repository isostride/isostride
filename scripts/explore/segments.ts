import fs from 'node:fs';
import { parseFit } from '../../lib/ingest/parseFit';
import { resample } from '../../lib/geo/geo';
import { detectRouteSegments } from '../../lib/prepare/segments';
const dir = 'test_data/coros_fit_2026';
const tracks = [];
for (const f of fs.readdirSync(dir).sort()) { try { const r = parseFit(new Uint8Array(fs.readFileSync(`${dir}/${f}`))); tracks.push({ runId: r.startTime, pts: resample(r.samples.lat, r.samples.lon, r.samples.t, 10) }); } catch {} }
const t0 = performance.now();
const segs = detectRouteSegments(tracks);
console.log('segments', segs.length, 'in', Math.round(performance.now() - t0), 'ms');
for (const s of segs.slice(0, 30)) console.log(s.length, 'm', 'runs', s.runs, 'passes', s.passes, 'hd', s.heading, `${s.track[0].lat},${s.track[0].lon} -> ${s.track.at(-1)!.lat},${s.track.at(-1)!.lon}`);
