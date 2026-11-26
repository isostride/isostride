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
// Unit times come from the unit-only run (no coverage, no integration tests beside them).
const unitRun = read('reports/vitest-unit.json');
// The 100 ms of a unit test, scaled by the speed of the machine they ran on against the reference
// machine (scripts/machine-speed.mjs; the runner's "skaluj limit do szybkosci maszyny").
const machine = read('reports/machine.json');
const unitLimitMs = 100 * (machine?.factor ?? 1);
if (!vitest) throw new Error('reports/vitest.json missing: run npm run test:report');

const tests = vitest.testResults.flatMap((f) =>
  f.assertionResults.map((a) => ({ file: path.relative(process.cwd(), f.name), ...a })),
);
const unit = tests.filter((t) => t.file.startsWith('tests/unit/'));
const integration = tests.filter((t) => t.file.startsWith('tests/integration/'));
const e2eCount = pw ? pw.stats.expected + pw.stats.unexpected + pw.stats.flaky + pw.stats.skipped : 0;
const all = unit.length + integration.length + e2eCount;
const pct = (n) => Math.round((1000 * n) / all) / 10;

/**
 * The unit tests over the limit, named in the log (a failure says which, not only how many). A test's
 * time is the lower of its two runs, when the unit tests ran twice (scripts/check.sh): what it takes,
 * not what it bore of the first imports and the warm-up in the run where it came first.
 */
const timesOf = (report) => (report ? report.testResults.flatMap((f) => f.assertionResults.map((t) => ({ ...t, file: f.name }))) : null);
const again = new Map((timesOf(read('reports/vitest-unit-2.json')) ?? []).map((t) => [`${t.file} ${t.fullName ?? t.title}`, t.duration ?? 0]));
const slow = (timesOf(unitRun) ?? unit)
  .map((t) => ({ ...t, duration: Math.min(t.duration ?? 0, again.get(`${t.file} ${t.fullName ?? t.title}`) ?? Infinity) }))
  .filter((t) => t.duration > unitLimitMs);
const m = {
  testsUnit: unit.length,
  testsIntegration: integration.length,
  testsE2e: e2eCount,
  unitSharePercent: pct(unit.length),
  e2eSharePercent: pct(e2eCount),
  unitOver100ms: slow.length,
  unitLimitMs: Math.round(unitLimitMs),
  machineFactor: machine?.factor ?? 1,
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
for (const t of slow) console.log(`unit test over ${Math.round(unitLimitMs)} ms: ${Math.round(t.duration)} ms ${(t.file ?? '').replace(/^.*\/apps\/app\//, '')} › ${t.fullName ?? t.title}`);
