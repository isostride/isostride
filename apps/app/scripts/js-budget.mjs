// JavaScript per route (ADR "Built with React": 240 KB per route since 26 Nov 2026, 220 KB before, 200 KB before 23 Nov 2026): for each screen's page in
// the static export, the gzip size of every script it references, which is what a host that
// compresses sends; noModule scripts, which the listed browsers skip, are left out. Writes reports/measures-js.json; exits 1 when a route is over budget.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const BUDGET_KB = 240;

export function routeScripts(exportDir) {
  const pages = fs.readdirSync(exportDir).filter((f) => f.endsWith('.html') && f !== '404.html');
  return Object.fromEntries(pages.map((page) => {
    const html = fs.readFileSync(path.join(exportDir, page), 'utf8');
    // A noModule script (polyfills for old browsers) is never loaded by the listed browsers.
    const tags = [...html.matchAll(/<script\b[^>]*>/gi)].map((m) => m[0]).filter((t) => !/\bnomodule\b/i.test(t));
    const srcs = [...new Set(tags.map((t) => t.match(/\bsrc="([^"]+)"/)?.[1]).filter(Boolean).map((s) => s.split('?')[0]))];
    const bytes = srcs.reduce((n, s) => n + zlib.gzipSync(fs.readFileSync(path.join(exportDir, s.replace(/^\//, '')))).length, 0);
    return [page.replace(/\.html$/, ''), Math.round(bytes / 102.4) / 10];
  }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? '.next-build';
  const kb = routeScripts(dir);
  const max = Math.max(...Object.values(kb));
  const over = Object.entries(kb).filter(([, v]) => v > BUDGET_KB);
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync('reports/measures-js.json', JSON.stringify({ scriptMaxKB: max, routesOverBudget: over.length }, null, 2));
  for (const [route, v] of Object.entries(kb)) console.log(`${route}: ${v} KB${v > BUDGET_KB ? ` — over the ${BUDGET_KB} KB budget` : ''}`);
  process.exit(over.length ? 1 : 0);
}
