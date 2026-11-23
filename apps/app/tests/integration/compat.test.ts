import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { recordMeasure } from '../support/fixtures';

const ROOT = path.resolve(__dirname, '../..');

/** Lints source text with the repository's eslint.config.mjs, optionally with other settings. */
async function lint(code: string, settings?: Record<string, unknown>) {
  const eslint = new ESLint({ cwd: ROOT, overrideConfig: settings ? [{ settings }] : [] });
  const [r] = await eslint.lintText(code, { filePath: path.join(ROOT, 'lib/probe.ts') });
  return r.messages.filter((m) => m.ruleId === 'compat/compat').map((m) => m.message);
}

describe('Supported browsers work', () => {
  it('Unsupported feature caught', async () => {
    // A listed browser that lacks Array#toSorted (Chrome 110 and later have it).
    const code = 'export const sorted = [3, 1].toSorted();\n';
    expect(await lint(code, { browsers: ['chrome 100'] })).toEqual([expect.stringMatching(/toSorted\(\) is not supported in Chrome 100/)]);
    // With a polyfill configured, the feature passes.
    expect(await lint(code, { browsers: ['chrome 100'], polyfills: ['Array.toSorted'] })).toEqual([]);
  }, 30_000);

  it('Features match browser list', async () => {
    // The repository's code against package.json's browserslist (last 2 Chrome, Edge, Opera).
    const eslint = new ESLint({ cwd: ROOT });
    const results = await eslint.lintFiles(['lib', 'app', 'components', 'workers']);
    const compat = results.flatMap((r) => r.messages.filter((m) => m.ruleId === 'compat/compat').map((m) => `${path.relative(ROOT, r.filePath)}:${m.line} ${m.message}`));
    await recordMeasure('compatViolations', compat.length);
    expect(compat).toEqual([]);
  }, 60_000);
});
