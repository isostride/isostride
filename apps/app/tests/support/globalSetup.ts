import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TestProject } from 'vitest/node';
import { Decoder, Stream } from '@garmin/fitsdk';

const FIXTURES = path.resolve(__dirname, '../fixtures');

declare module 'vitest' {
  export interface ProvidedContext {
    fixturesFolder: string;
    expected: Record<string, Record<string, unknown>>;
  }
}

/**
 * Integration tests' global setup (FF "Fixtures load in every run"): copies the versioned FIT
 * fixtures into a fresh temporary data folder (fit/) and loads their hand-checked expected
 * values. A fixture without expected values, or one that is not a FIT file at all, fails the
 * setup and with it the run. Records fixtures.load_errors and fixtures.without_expected_values.
 */
export default function setup(project: TestProject) {
  const expected = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'expected.json'), 'utf8'));
  delete expected.$comment;
  const files = fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.fit'));
  const without = files.filter((f) => !expected[f]);
  // A fixture loads when its bytes are a FIT file (a damaged one is still a FIT file whose
  // integrity check fails, which expected.json states as its expected error).
  const loadErrors = files.filter((f) => !Decoder.isFIT(Stream.fromByteArray([...fs.readFileSync(path.join(FIXTURES, f))])));
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'strideprism-fixtures-'));
  fs.mkdirSync(path.join(folder, 'fit'));
  for (const f of files) fs.copyFileSync(path.join(FIXTURES, f), path.join(folder, 'fit', f));
  const dir = path.resolve(__dirname, '../../reports/measures.d');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'fixturesLoadErrors.json'), String(loadErrors.length));
  fs.writeFileSync(path.join(dir, 'fixturesWithoutExpectedValues.json'), String(without.length));
  if (without.length || loadErrors.length || !files.length)
    throw new Error(`FIT fixtures: ${files.length} found; without expected values: ${without.join(', ') || 'none'}; not FIT: ${loadErrors.join(', ') || 'none'}`);
  project.provide('fixturesFolder', folder);
  project.provide('expected', expected);
  return () => fs.rmSync(folder, { recursive: true, force: true });
}
