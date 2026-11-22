import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { recordMeasure } from '../support/fixtures';

/**
 * Run and Compare kept apart (ADR "Run and Compare kept apart"): the Run screen analyses one run and
 * reads nothing across the runs; comparing (similar efforts, segments' efforts, curves) is Compare's.
 */
describe('Screens and their parts', () => {
  it('The Run screen compares nothing itself', async () => {
    const dir = path.resolve(__dirname, '../../app/run');
    const across = ['similarInWorker', 'instancesInWorker', 'curvesInWorker', 'figuresInWorker'];
    const found = fs.readdirSync(dir).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
      .flatMap((f) => across.filter((name) => fs.readFileSync(path.join(dir, f), 'utf8').includes(name)).map((name) => `${f}: ${name}`));
    await recordMeasure('runCrossRunReads', found.length);
    expect(found).toEqual([]);
  });
});
