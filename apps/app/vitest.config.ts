import path from 'node:path';
import { defineConfig } from 'vitest/config';

const alias = { '@': path.resolve(import.meta.dirname) };

/**
 * Two projects (ADR "A test pyramid"): unit tests on synthetic data, with the network
 * blocked and 100 ms each at most; integration tests on the runner's FIT files and a
 * data folder on disk. Files and tests run in random order; a failure prints the seed.
 */
export default defineConfig({
  test: {
    sequence: { shuffle: true },
    // Coverage of the processing code, for the new-code coverage check (scripts/coverage-new.mjs).
    coverage: { provider: 'v8', include: ['lib/**'], exclude: ['lib/client/**'], reporter: ['json'], reportsDirectory: 'reports/coverage' },
    projects: [
      { resolve: { alias }, test: { name: 'unit', environment: 'node', include: ['tests/unit/**/*.test.ts'], setupFiles: ['tests/support/noNetwork.ts'] } },
      { resolve: { alias }, test: { name: 'integration', environment: 'node', include: ['tests/integration/**/*.test.ts'], globalSetup: ['tests/support/globalSetup.ts'], testTimeout: 120_000 } },
    ],
  },
});
