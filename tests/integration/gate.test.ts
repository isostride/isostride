import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');

describe('Fast tests on every change', () => {
  it('Change is tested in time', () => {
    // A change with a failing test: the run reports the failure, within 10 minutes, and fails.
    const dir = fs.mkdtempSync(path.join(ROOT, 'reports', 'gate-'));
    fs.writeFileSync(path.join(dir, 'broken.test.ts'), "import { expect, it } from 'vitest';\nit('adds', () => expect(1 + 1).toBe(3));\n");
    fs.writeFileSync(path.join(dir, 'vitest.config.mjs'), 'export default {};\n');
    const t0 = Date.now();
    const r = spawnSync('npx', ['vitest', 'run', '--root', dir, '--config', path.join(dir, 'vitest.config.mjs'), '--reporter', 'default'], { cwd: ROOT, encoding: 'utf8' });
    const seconds = (Date.now() - t0) / 1000;
    fs.rmSync(dir, { recursive: true, force: true });
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toMatch(/1 failed/);
    expect(seconds).toBeLessThan(600);
  }, 120_000);
});

describe('Journeys tested before merge', () => {
  it('Broken journey blocks merge', () => {
    // A change breaks the trend journey: its end-to-end test fails, and the check of the change fails naming it.
    const report = {
      config: {}, suites: [{ title: 'trend.spec.ts', file: 'trend.spec.ts', specs: [], suites: [{ title: 'Show trend', file: 'trend.spec.ts', specs: [{ title: 'Trend draws noise threshold and gear changes', file: 'trend.spec.ts', ok: false, tests: [{ projectName: 'chromium', status: 'unexpected', results: [{ status: 'failed' }] }] }] }] }],
      errors: [], stats: { expected: 0, unexpected: 1, flaky: 0, skipped: 0 },
    };
    const file = path.join(os.tmpdir(), `broken-journey-${process.pid}.json`);
    fs.writeFileSync(file, JSON.stringify(report));
    let out = '';
    let code = 0;
    try {
      out = execFileSync('sh', ['radical.sh', 'check', '.radical/model', '--report', file, '--format', 'json'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      code = (e as { status: number }).status;
      out = (e as { stdout: string }).stdout;
    }
    const result = JSON.parse(out);
    expect(code).not.toBe(0);
    expect(result.ok).toBe(false);
    const failed = result.findings.filter((f: { rule: string; message: string }) => f.rule === 'test-failed' && f.message.includes('Trend draws noise threshold and gear changes'));
    expect(failed.length).toBeGreaterThan(0);
  }, 120_000);
});
