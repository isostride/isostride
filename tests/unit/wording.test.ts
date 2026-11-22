import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { recordMeasure } from '../support/fixtures';

/** Every .tsx file of the screens and their components. */
function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(path.join(dir, e.name)) : e.name.endsWith('.tsx') ? [path.join(dir, e.name)] : []));
}

/**
 * The words of the screens (ADR "Segment and effort on screen"): no "block" and no "stretch" in what
 * a runner reads, the text between tags and the labels, titles and placeholders; the code keeps them.
 */
describe('Words of the screens', () => {
  it('Screens say segment and effort', async () => {
    const root = path.resolve(__dirname, '../..');
    const found: string[] = [];
    for (const file of [...sources(path.join(root, 'app')), ...sources(path.join(root, 'components'))]) {
      const text = fs.readFileSync(file, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
      const shown = [
        ...[...text.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]),
        ...[...text.matchAll(/\b(?:aria-label|title|placeholder)="([^"]*)"/g)].map((m) => m[1]),
      ];
      // Text between tags, not code between a type's angle brackets.
      for (const s of shown) if (!/[;=()]|\/\/|\/\*/.test(s) && /\b(blocks?|stretch(es)?)\b/i.test(s)) found.push(`${path.relative(root, file)}: ${s.trim()}`);
    }
    await recordMeasure('uiBlockWords', found.length);
    expect(found).toEqual([]);
  });
});
