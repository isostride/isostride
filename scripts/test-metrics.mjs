// Reads the test reports (reports/vitest.json, reports/playwright.json) and writes the
// test-strategy measurements to reports/measures-tests.json, for scripts/metrics.sh:
// the share of unit, integration and end-to-end tests, unit tests over 100 ms or reaching
// the network, failed and skipped tests, and the suite's wall time (reports/timing.json).
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const vitest = read('reports/vitest.json');
const pw = read('reports/playwright.json');
const timing = read('reports/timing.json') ?? {};
if (!vitest) throw new Error('reports/vitest.json missing: run npm run test:report');

const tests = vitest.testResults.flatMap((f) =>
  f.assertionResults.map((a) => ({ file: path.relative(process.cwd(), f.name), ...a })),
);
const unit = tests.filter((t) => t.file.startsWith('tests/unit/'));
const integration = tests.filter((t) => t.file.startsWith('tests/integration/'));
const e2eCount = pw ? pw.stats.expected + pw.stats.unexpected + pw.stats.flaky + pw.stats.skipped : 0;
const all = unit.length + integration.length + e2eCount;
const pct = (n) => Math.round((1000 * n) / all) / 10;

const m = {
  testsUnit: unit.length,
  testsIntegration: integration.length,
  testsE2e: e2eCount,
  unitSharePercent: pct(unit.length),
  e2eSharePercent: pct(e2eCount),
  unitOver100ms: unit.filter((t) => (t.duration ?? 0) > 100).length,
  unitNetworkCalls: unit.filter((t) => (t.failureMessages ?? []).some((x) => x.includes('unit tests touch no network'))).length,
  vitestFailed: tests.filter((t) => t.status === 'failed').length,
  vitestSkipped: tests.filter((t) => t.status === 'skipped' || t.status === 'pending' || t.status === 'todo').length,
  e2eFailed: pw ? pw.stats.unexpected : null,
  e2eSkipped: pw ? pw.stats.skipped : null,
  e2eFlaky: pw ? pw.stats.flaky : null,
};
if (timing.testsSeconds != null) m.testsSeconds = timing.testsSeconds;
for (const [k, v] of Object.entries(m)) if (v === null) delete m[k];
fs.writeFileSync('reports/measures-tests.json', JSON.stringify(m, null, 2));
console.log(m);
