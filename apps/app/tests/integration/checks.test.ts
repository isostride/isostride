import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** The checks run as a command does in npm run check: their exit code fails the check. */
const ROOT = path.resolve(__dirname, '../..');
type Part = { uses?: string[]; runs?: 'main' | 'worker' | 'both'; kernel?: boolean; allow?: string[] };

function tree(parts: Record<string, Part>, files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boundaries-'));
  for (const [p, d] of Object.entries(parts)) {
    fs.mkdirSync(path.join(dir, p), { recursive: true });
    fs.writeFileSync(path.join(dir, p, 'module.json'), JSON.stringify(d));
    fs.writeFileSync(path.join(dir, p, 'index.ts'), 'export const x = 1;\n');
  }
  for (const [f, src] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), src);
  return dir;
}

describe('Violations fail the build', () => {
  it('Violation blocks merge', () => {
    // A forbidden dependency: the check exits non-zero, naming the rule and both parts.
    const parts: Record<string, Part> = { 'lib/client': { uses: ['lib/pipeline'], runs: 'main' }, 'lib/pipeline': { runs: 'worker' } };
    const dir = tree(parts, { 'lib/client/worker.ts': "import { x } from '@/lib/pipeline';\n" });
    let out = '';
    let code = 0;
    try {
      execFileSync('node', [path.join(ROOT, 'scripts/boundaries.mjs'), dir], { encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
      code = (e as { status: number }).status;
      out = (e as { stderr: string }).stderr;
    }
    expect(code).toBe(1);
    expect(out).toMatch(/main-thread: lib\/client .* lib\/pipeline/);
  });
});
describe('JavaScript within budget', () => {
  it('Bundle over budget refused', async () => {
    // A change adds a large library to a route: the route's scripts pass 240 KB gzipped.
    const { routeScripts, BUDGET_KB } = await import('../../scripts/js-budget.mjs' as string);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-'));
    fs.mkdirSync(path.join(dir, '_next'));
    fs.writeFileSync(path.join(dir, '_next/app.js'), 'console.log(1);'.repeat(100));
    // ~250 KB of incompressible bytes stand for the library.
    fs.writeFileSync(path.join(dir, '_next/library.js'), randomBytes(250 * 1024));
    fs.writeFileSync(path.join(dir, 'index.html'), '<script src="/_next/app.js"></script>');
    fs.writeFileSync(path.join(dir, 'trend.html'), '<script src="/_next/app.js"></script><script src="/_next/library.js"></script>');
    const kb = routeScripts(dir);
    expect(kb.index).toBeLessThan(BUDGET_KB);
    expect(kb.trend).toBeGreaterThan(BUDGET_KB);
    let code = 0;
    try { execFileSync('node', [path.join(ROOT, 'scripts/js-budget.mjs'), dir], { cwd: os.tmpdir(), stdio: 'pipe' }); } catch (e) { code = (e as { status: number }).status; }
    expect(code).toBe(1);
  });
});