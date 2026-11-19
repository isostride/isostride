import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { recordMeasure } from '../support/fixtures';

/** The journeys ADR "A test pyramid" names; each has a Playwright spec e2e/<journey>.spec.ts. */
const JOURNEYS = ['import', 'block-definition', 'trend', 'ab-comparison'];
const E2E = path.resolve(__dirname, '../../e2e');

describe('Journeys tested before merge', () => {
  it('Every journey has an end-to-end spec', async () => {
    const missing = JOURNEYS.filter((j) => !fs.existsSync(path.join(E2E, `${j}.spec.ts`)));
    // No test.only or test.skip left in the specs: the gate runs every journey.
    const specs = fs.readdirSync(E2E).filter((f) => f.endsWith('.spec.ts'));
    const focused = specs.filter((f) => /\btest\.(only|skip|fixme)\(|\.describe\.(only|skip)\(/.test(fs.readFileSync(path.join(E2E, f), 'utf8')));
    await recordMeasure('journeysCoveredPercent', Math.round((100 * (JOURNEYS.length - missing.length)) / JOURNEYS.length));
    expect(missing).toEqual([]);
    expect(focused).toEqual([]);
  });
});
