import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
// @ts-expect-error a plain ES module without types
import { checkBoundaries } from '../../scripts/boundaries.mjs';
import { recordMeasure } from '../support/fixtures';

const ROOT = path.resolve(__dirname, '../..');
type Violation = { rule: string; from: string; to: string; file: string; message: string };
type Part = { uses?: string[]; runs?: 'main' | 'worker' | 'both'; kernel?: boolean; allow?: string[] };

/** A throwaway source tree: parts with their module.json and files. */
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
const check = (dir: string): Violation[] => checkBoundaries(dir).violations;

/**
 * The repository's own parts, read from the disk once for the tests that judge them: the reading is
 * no part of what they check, and its time is the disk's (a unit test's 100 ms are its own logic's).
 */
let repo: ReturnType<typeof checkBoundaries>;
beforeAll(() => { repo = checkBoundaries(ROOT); });

describe('Processing in a Web Worker', () => {
  it('Processing modules load only in the worker', async () => {
    const { violations, measures } = repo;
    const mainThread = violations.filter((v: Violation) => v.rule === 'main-thread');
    await recordMeasure('processingOnMainThreadViolations', mainThread.length);
    expect(mainThread).toEqual([]);
    expect(measures.parts).toBeGreaterThanOrEqual(15);
  });
});

describe('Module boundaries', () => {
  it('The parts keep their boundaries', async () => {
    // The repository itself: no cycle, no undeclared dependency, no deep import, a small kernel.
    const { violations, measures } = repo;
    for (const [k, v] of Object.entries(measures)) await recordMeasure(k, v as number);
    expect(violations).toEqual([]);
    expect(measures.kernelSharePercent).toBeLessThanOrEqual(5);
  });
});

describe('No cycles between parts', () => {
  it('Cycle refused', () => {
    // detection depends on blocks; a change makes blocks depend on detection.
    const parts = { 'lib/blocks': { uses: ['lib/detection'] }, 'lib/detection': { uses: ['lib/blocks'] } };
    const dir = tree(parts, { 'lib/detection/detect.ts': "import { x } from '@/lib/blocks';\n", 'lib/blocks/types.ts': "import { x } from '@/lib/detection';\n" });
    const cycles = check(dir).filter((v) => v.rule === 'cycle');
    expect(cycles).toHaveLength(1);
    expect(cycles[0].message).toContain('lib/blocks');
    expect(cycles[0].message).toContain('lib/detection');
  });
});

describe('Only declared dependencies', () => {
  it('Undeclared dependency found', () => {
    // compare may use blocks and stats only; a change makes it import from ingest.
    const parts = { 'lib/compare': { uses: ['lib/blocks', 'lib/stats'] }, 'lib/blocks': {}, 'lib/stats': {}, 'lib/ingest': {} };
    const dir = tree(parts, { 'lib/compare/trend.ts': "import { x } from '@/lib/blocks';\nimport { x as y } from '@/lib/ingest';\n" });
    expect(check(dir)).toEqual([expect.objectContaining({ rule: 'undeclared', from: 'lib/compare', to: 'lib/ingest', file: 'lib/compare/trend.ts' })]);
  });
});

describe('Parts meet through APIs', () => {
  it('Internal access refused', () => {
    // compare imports a file of blocks that is not its index.
    const parts = { 'lib/compare': { uses: ['lib/blocks'] }, 'lib/blocks': {} };
    const dir = tree(parts, { 'lib/blocks/types.ts': 'export type T = 1;\n', 'lib/compare/ab.ts': "import type { T } from '@/lib/blocks/types';\n" });
    expect(check(dir)).toEqual([expect.objectContaining({ rule: 'internal-access', from: 'lib/compare', to: 'lib/blocks' })]);
  });
});

describe('Shared kernel stays small', () => {
  it('Kernel stays small', () => {
    // The kernel imports a part and a package outside its allowlist, and passes 5% of the lines.
    const parts = { 'lib/kernel': { kernel: true, allow: [] }, 'lib/fs': {} };
    const big = Array.from({ length: 50 }, (_, i) => `export const k${i} = ${i};`).join('\n');
    const dir = tree(parts, { 'lib/kernel/run.ts': `import { x } from '@/lib/fs';\nimport { Decoder } from '@garmin/fitsdk';\n${big}\n` });
    const rules = check(dir).map((v) => v.rule).sort();
    expect(rules).toEqual(['kernel', 'kernel', 'kernel-size', 'undeclared']);
  });
});
