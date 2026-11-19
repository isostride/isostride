// Coverage of new and changed code (FF "Coverage of new code"), branches included: the lines
// changed since the last commit (or, with a clean tree, in the last commit) in the processing
// code, against the Vitest coverage report (reports/coverage/coverage-final.json).
// Writes reports/measures-coverage.json; lists the uncovered changed lines.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * changed: Map(file → Set(line)); coverage: istanbul coverage-final.json keyed by absolute path.
 * Returns the covered and total statements and branches on the changed lines, and what is missed.
 */
export function newCodeCoverage(changed, coverage, root = process.cwd()) {
  let total = 0;
  let covered = 0;
  const missed = [];
  for (const [f, lines] of changed) {
    const c = coverage[path.resolve(root, f)];
    if (!c) { total += lines.size; missed.push(`${f}: not loaded by any test`); continue; }
    for (const [id, loc] of Object.entries(c.statementMap)) {
      if (!lines.has(loc.start.line)) continue;
      total++;
      if (c.s[id] > 0) covered++; else missed.push(`${f}:${loc.start.line}`);
    }
    for (const [id, br] of Object.entries(c.branchMap)) {
      if (!lines.has(br.loc?.start?.line ?? br.line)) continue;
      c.b[id].forEach((hits, k) => { total++; if (hits > 0) covered++; else missed.push(`${f}:${br.loc?.start?.line ?? br.line} (branch ${k + 1})`); });
    }
  }
  return { covered, total, percent: total ? Math.round((1000 * covered) / total) / 10 : 100, missed };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // The worker's message handler runs only in the browser; the end-to-end tests cover it.
  const SCOPE = ['lib'];
  const sh = (c) => execSync(c, { encoding: 'utf8' });
  let base = 'HEAD';
  let diff = sh(`git diff -U0 HEAD -- ${SCOPE.join(' ')}`);
  const untracked = sh(`git ls-files --others --exclude-standard -- ${SCOPE.join(' ')}`).split('\n').filter(Boolean);
  if (!diff.trim() && !untracked.length) { base = 'HEAD~1'; diff = sh(`git diff -U0 HEAD~1 HEAD -- ${SCOPE.join(' ')}`); }

  /** file → set of changed line numbers */
  const changed = new Map();
  let file = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) file = line.slice(6) === 'dev/null' ? null : line.slice(6);
    const m = line.match(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/);
    if (m && file) {
      const set = changed.get(file) ?? new Set();
      for (let i = 0; i < Number(m[2] ?? 1); i++) set.add(Number(m[1]) + i);
      changed.set(file, set);
    }
  }
  for (const f of untracked) changed.set(f, new Set(fs.readFileSync(f, 'utf8').split('\n').map((_, i) => i + 1)));
  for (const f of [...changed.keys()]) if (!/\.(ts|tsx)$/.test(f) || f.startsWith('lib/client/') || f.endsWith('.d.ts')) changed.delete(f);

  const cov = JSON.parse(fs.readFileSync('reports/coverage/coverage-final.json', 'utf8'));
  const { covered, total, percent, missed } = newCodeCoverage(changed, cov);
  fs.writeFileSync('reports/measures-coverage.json', JSON.stringify({ newCodeCoveragePercent: percent, newCodeItems: total }, null, 2));
  console.log(`new code since ${base}: ${covered}/${total} statements and branches covered (${percent}%)`);
  if (missed.length) console.log(`uncovered:\n  ${[...new Set(missed)].slice(0, 40).join('\n  ')}`);
  process.exit(percent < 80 ? 1 : 0);
}
