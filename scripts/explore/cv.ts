import fs from 'node:fs';
import { parseFit } from '../../lib/ingest/parseFit';
const dir = 'test_data/coros_fit_2026';
// CV of 1 s speed vs 10 s mean speed over 5-min stretches from minute 10 to 15 of each run
const rows: string[] = [];
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.fit')).sort().slice(-40)) {
  try {
    const r = parseFit(new Uint8Array(fs.readFileSync(`${dir}/${f}`)));
    const s = r.samples; const v: number[] = [];
    for (let i = 0; i < s.t.length; i++) if (s.t[i] >= 600 && s.t[i] < 900 && s.speed[i] !== null) v.push(s.speed[i]!);
    const cv = (xs: number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) / m; };
    const w: number[] = []; for (let k = 0; k + 10 <= v.length; k += 10) w.push(v.slice(k, k + 10).reduce((a, b) => a + b, 0) / 10);
    const zeros = v.filter((x) => x < 0.5).length;
    rows.push(`${r.startTime.slice(0, 10)} cv1s=${cv(v).toFixed(3)} cv10s=${cv(w).toFixed(3)} n=${v.length} stopped=${zeros} min=${Math.min(...v).toFixed(2)} max=${Math.max(...v).toFixed(2)}`);
  } catch {}
}
console.log(rows.join('\n'));
