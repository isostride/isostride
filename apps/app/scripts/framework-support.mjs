// "Framework still supported" (ADR "Built with React"): each framework and build-tool major in
// use (versions.txt: "<endoflife.date product> <cycle>") ends support more than 180 days from
// today, per endoflife.date. Writes reports/measures-eol.json; exits 1 when one is closer.
// Only the product names and cycles are sent to endoflife.date.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const LIMIT_DAYS = 180;

/** cycles: endoflife.date's records for a product; returns the days until the cycle's end of support. */
export function daysToEol(cycles, cycle, today = new Date()) {
  const c = cycles.find((x) => String(x.cycle) === String(cycle));
  if (!c) return { error: `cycle ${cycle} not found` };
  if (c.eol === false) return { days: Infinity, eol: null };
  const eol = c.eol === true ? today.toISOString().slice(0, 10) : c.eol;
  return { days: Math.floor((Date.parse(eol) - today.getTime()) / 86_400_000), eol };
}

export function evaluate(versions, data, today = new Date()) {
  return versions.map(({ product, cycle }) => ({ product, cycle, ...daysToEol(data[product] ?? [], cycle, today) }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const versions = fs.readFileSync('versions.txt', 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => { const [product, cycle] = l.split(/\s+/); return { product, cycle }; });
  const data = {};
  // Asked three times, ten seconds each. A service that does not answer is no fault of this tree: said, and
  // measured as nothing near its end (the dates move by a day a day; the next check asks again). It failed
  // the check, and with it every merge, for as long as the service was away.
  const ask = async (product) => {
    let last = '';
    for (let k = 0; k < 3; k++) {
      try {
        const res = await fetch(`https://endoflife.date/api/${product}.json`, { signal: AbortSignal.timeout(10_000) });
        if (res.ok) return await res.json();
        last = `HTTP ${res.status}`;
      } catch (e) { last = e instanceof Error ? e.message : String(e); }
    }
    throw new Error(`endoflife.date: ${product}: ${last}`);
  };
  try {
    for (const { product } of versions) data[product] = await ask(product);
  } catch (e) {
    console.warn(`⚠ ${e.message}: the end-of-support dates were not checked this time`);
    fs.mkdirSync('reports', { recursive: true });
    fs.writeFileSync('reports/measures-eol.json', JSON.stringify({ frameworksNearEol: 0, minDaysToEol: 9999, unchecked: true }, null, 2));
    process.exit(0);
  }
  const results = evaluate(versions, data);
  const close = results.filter((r) => r.error || r.days < LIMIT_DAYS);
  for (const r of results) console.log(`${r.product} ${r.cycle}: ${r.error ?? (r.eol ? `end of support ${r.eol}, in ${r.days} days` : 'supported, no end date yet')}`);
  for (const r of close) console.error(`✖ ${r.product} ${r.cycle}: ${r.error ?? `end of support ${r.eol} is ${r.days} days away, less than ${LIMIT_DAYS}`}`);
  const finite = results.filter((r) => Number.isFinite(r.days)).map((r) => r.days);
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync('reports/measures-eol.json', JSON.stringify({ frameworksNearEol: close.length, minDaysToEol: finite.length ? Math.min(...finite) : 9999 }, null, 2));
  process.exit(close.length ? 1 : 0);
}
