import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TestModule } from 'vitest/node';
// @ts-expect-error a plain ES module without types
import { newCodeCoverage } from '../../scripts/coverage-new.mjs';
import FlakyReporter from '../support/flakyReporter';

describe('New code is covered', () => {
  it('Uncovered code refused', () => {
    // A change adds 10 statements and a branch; the tests run 6 statements and one side of the branch.
    const file = path.resolve('lib/x/new.ts');
    const statementMap = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), { start: { line: i + 1 } }]));
    const s = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), i < 6 ? 1 : 0]));
    const coverage = { [file]: { statementMap, s, branchMap: { 0: { loc: { start: { line: 3 } } } }, b: { 0: [4, 0] } } };
    const changed = new Map([['lib/x/new.ts', new Set(Array.from({ length: 10 }, (_, i) => i + 1))]]);
    const r = newCodeCoverage(changed, coverage);
    expect(r).toMatchObject({ covered: 7, total: 12, percent: 58.3 });
    expect(r.percent).toBeLessThan(80);
    expect(r.missed).toContain('lib/x/new.ts:3 (branch 2)');
    // An unchanged line does not count.
    expect(newCodeCoverage(new Map([['lib/x/new.ts', new Set([1, 2])]]), coverage).percent).toBe(100);
  });
});

describe('Flaky tests quarantined', () => {
  const flakyModule = (name: string) =>
    ({ moduleId: path.resolve('tests/unit/x.test.ts'), children: { *allTests() { yield { fullName: name, module: { moduleId: path.resolve('tests/unit/x.test.ts') }, diagnostic: () => ({ flaky: true }) }; } } }) as unknown as TestModule;

  it('Flaky test leaves the gate', () => {
    // A test that failed and then passed on its retry: the run fails until quarantine.json lists it.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flaky-'));
    const files = { flaky: path.join(dir, 'flaky.json'), quarantine: path.join(dir, 'quarantine.json') };
    fs.writeFileSync(files.quarantine, '[]');
    const before = process.exitCode;
    try {
      new FlakyReporter(files).onTestRunEnd([flakyModule('Import > Import new FIT files')]);
      expect(process.exitCode).toBe(1);
      expect(JSON.parse(fs.readFileSync(files.flaky, 'utf8'))).toEqual(['tests/unit/x.test.ts › Import › Import new FIT files']);
      process.exitCode = 0;
      fs.writeFileSync(files.quarantine, JSON.stringify([{ test: 'tests/unit/x.test.ts › Import › Import new FIT files', owner: 'author', ticket: 'Q-1', since: '2026-11-19' }]));
      new FlakyReporter(files).onTestRunEnd([flakyModule('Import > Import new FIT files')]);
      expect(process.exitCode).toBe(0);
    } finally {
      process.exitCode = before;
    }
  });
});

describe('Mostly fast unit tests', () => {
  it('Unit test stays isolated', async () => {
    // The unit project blocks the network: a fetch or a socket fails at once.
    await expect(fetch('http://example.com')).rejects.toThrow('unit tests touch no network');
    const net = await import('node:net');
    expect(() => new net.Socket().connect(80, 'example.com')).toThrow('unit tests touch no network');
  });
});
