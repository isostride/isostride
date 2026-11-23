// The speed of the machine the tests run on (the runner's "skaluj limit do szybkosci maszyny"): a
// fixed piece of work like a unit test's (samples built, 10 s means, a sort, a JSON round trip),
// timed after a warm-up, its median against the same work on the reference machine, the author's
// Mac, where the 100 ms of a unit test were set. Writes reports/machine.json; the unit tests' time
// rule (scripts/test-metrics.mjs) scales its 100 ms by the factor, never below 1.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The work's median on the reference machine, ms (measured on 23 Nov 2026). */
export const REFERENCE_MS = 17;

function work() {
  const n = 20000;
  const samples = Array.from({ length: n }, (_, i) => ({ t: i, v: 3 + Math.sin(i / 50), h: 120 + (i % 30) }));
  let s = 0;
  for (let k = 0; k < 80; k++) {
    const means = [];
    for (let i = 0; i < n; i += 10) {
      let m = 0;
      for (let j = i; j < i + 10 && j < n; j++) m += samples[j].v * (1 + k / 100);
      means.push(m / 10);
    }
    means.sort((a, b) => a - b);
    s += means[means.length >> 1];
  }
  return s + JSON.parse(JSON.stringify(samples.slice(0, 5000))).length;
}

/** The work's median time here, ms: 3 runs to warm up, then 9 timed. */
export function measure() {
  for (let i = 0; i < 3; i++) work();
  const times = [];
  for (let i = 0; i < 9; i++) {
    const t0 = performance.now();
    work();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[4];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Measured again after the unit tests: the slower of the two stands, as the machine's speed may
  // change while they run (a shared runner).
  const before = fs.existsSync('reports/machine.json') && process.argv[2] === 'again' ? JSON.parse(fs.readFileSync('reports/machine.json', 'utf8')).workMs : 0;
  const ms = Math.max(measure(), before);
  const reference = REFERENCE_MS;
  const factor = Math.max(1, Math.round((ms / reference) * 100) / 100);
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync('reports/machine.json', JSON.stringify({ workMs: Math.round(ms * 10) / 10, referenceMs: reference, factor }, null, 2));
  console.log(`machine: the work in ${ms.toFixed(1)} ms against ${reference} ms on the reference machine: the unit tests' limit × ${factor}`);
}
