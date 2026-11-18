import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { recordMeasure } from './support/fixtures';

const ROOT = path.resolve(__dirname, '..');
/** Code that runs on the main thread. */
const MAIN_THREAD = ['app', 'components', 'lib/client'];
/** Processing modules, which only the Processing Worker may load (ADR "Processing in a Web Worker"). */
const PROCESSING = [/^@\/lib\/ingest\//, /^@\/lib\/prepare\//, /^@\/lib\/blocks\/(?!definitions$|types$)/, /^@\/lib\/context\/(joinContext|dayState)$/];

async function sources(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(path.join(ROOT, dir), { withFileTypes: true, recursive: true })) {
    if (e.isFile() && /\.(ts|tsx)$/.test(e.name)) out.push(path.join(e.parentPath, e.name));
  }
  return out;
}

describe('Non-blocking processing', () => {
  it('Processing modules load only in the worker', async () => {
    const violations: string[] = [];
    for (const dir of MAIN_THREAD) {
      for (const file of await sources(dir)) {
        const text = await fs.readFile(file, 'utf8');
        // Type-only imports vanish at build time and load nothing.
        for (const m of text.matchAll(/^import\s+(?!type\b)[^'"]*from\s+['"]([^'"]+)['"]/gm)) {
          if (PROCESSING.some((re) => re.test(m[1]))) violations.push(`${path.relative(ROOT, file)} → ${m[1]}`);
        }
      }
    }
    await recordMeasure('processingOnMainThreadViolations', violations.length);
    expect(violations).toEqual([]);
  });
});
