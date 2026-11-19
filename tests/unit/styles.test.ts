import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { recordMeasure } from '../support/fixtures';

const ROOT = path.resolve(__dirname, '../..');
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

/** Colour literals outside the theme's tokens: in CSS, any declaration but a custom property; in components, any literal. */
export function untokenized(css: string, tsx: Record<string, string>): string[] {
  const out: string[] = [];
  css.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\*.*?\*\//g, '');
    for (const decl of code.split(';')) if (COLOUR.test(decl) && !/^\s*--[\w-]+\s*:/.test(decl.replace(/^.*\{/, ''))) out.push(`globals.css:${i + 1} ${decl.trim()}`);
  });
  for (const [file, src] of Object.entries(tsx))
    src.split('\n').forEach((line, i) => { if (COLOUR.test(line)) out.push(`${file}:${i + 1}`); });
  return out;
}

describe('Library used through its theme', () => {
  it('Internal override refused', () => {
    // A stylesheet change that sets a colour of its own instead of the theme's token.
    const css = ':root { --accent: #4f46e5; }\n.btn.primary { background: var(--accent); }\n.btn.danger { background: #dc2626; }\n';
    expect(untokenized(css, {})).toEqual(['globals.css:3 .btn.danger { background: #dc2626']);
    expect(untokenized('.x { color: var(--text); }', { 'c.tsx': '<rect fill="#fff" />' })).toEqual(['c.tsx:1']);
  });

  it('Styles go through the theme tokens', async () => {
    const css = fs.readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8');
    const tsx: Record<string, string> = {};
    for (const dir of ['app', 'components'])
      for (const f of fs.readdirSync(path.join(ROOT, dir), { recursive: true }) as string[])
        if (f.endsWith('.tsx')) tsx[`${dir}/${f}`] = fs.readFileSync(path.join(ROOT, dir, f), 'utf8');
    const found = untokenized(css, tsx);
    await recordMeasure('untokenizedColours', found.length);
    expect(found).toEqual([]);
  });
});
