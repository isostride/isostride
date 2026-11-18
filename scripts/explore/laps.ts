import fs from 'node:fs';
import { parseFit } from '../../lib/ingest/parseFit';
const dir = 'test_data/coros_fit_2026';
for (const f of fs.readdirSync(dir).sort()) {
  try {
    const r = parseFit(new Uint8Array(fs.readFileSync(`${dir}/${f}`)));
    const laps = r.laps.map((l) => `${(l.distance/1000).toFixed(2)}km/${(l.duration/60).toFixed(1)}m@${l.duration? (1000/(l.distance/l.duration)/60).toFixed(2):'-'}`);
    console.log(r.startTime.slice(0,10), laps.length, laps.join(' '));
  } catch {}
}
