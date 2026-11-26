// Runs a test command for the pipeline, whose logs are public (the repository is): a failed
// assertion prints what it compared, values of the runner's own runs, and a failed end-to-end test the
// text of the page. So in CI the command's output goes to reports/log-<name>.txt, handed to the
// verdict's bucket with the other reports, and the public log gets only the names of the tests that
// failed, read from the JSON reports named after --. Outside CI the command runs as it is.
//   node scripts/quiet.mjs <name> [--vitest <json>]... [--playwright <json>]... -- <command> [args]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const args = process.argv.slice(2);
const cut = args.indexOf('--');
const [name, ...opts] = args.slice(0, cut);
const [command, ...rest] = args.slice(cut + 1);
const reports = { vitest: [], playwright: [] };
for (let i = 0; i < opts.length; i += 2) reports[opts[i].slice(2)].push(opts[i + 1]);

if (!process.env.CI) process.exit(spawnSync(command, rest, { stdio: 'inherit' }).status ?? 1);

fs.mkdirSync('reports', { recursive: true });
const log = `reports/log-${name}.txt`;
const out = fs.openSync(log, 'w');
const status = spawnSync(command, rest, { stdio: ['ignore', out, out] }).status ?? 1;
fs.closeSync(out);

/** The tests of a report that failed, by file and title. */
export function failedTests(kind, file) {
  if (!fs.existsSync(file)) return [];
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (kind === 'vitest') {
    return (report.testResults ?? []).flatMap((f) => (f.assertionResults ?? []).filter((a) => a.status === 'failed')
      .map((a) => `${f.name.replace(`${process.cwd()}/`, '')} › ${[...(a.ancestorTitles ?? []), a.title].join(' › ')}`));
  }
  const found = [];
  const walk = (suite, path) => {
    for (const spec of suite.specs ?? []) if (!spec.ok) found.push(`${spec.file ?? suite.file} › ${[...path, spec.title].join(' › ')}`);
    for (const child of suite.suites ?? []) walk(child, child.file === child.title ? path : [...path, child.title]);
  };
  for (const suite of report.suites ?? []) walk(suite, []);
  return found;
}

const failed = [...reports.vitest.flatMap((f) => failedTests('vitest', f)), ...reports.playwright.flatMap((f) => failedTests('playwright', f))];
console.log(`${name}: ${status === 0 ? 'passed' : 'failed'}; its output is in the run's reports (${log}), not in this public log`);
for (const t of failed) console.log(`  failed: ${t}`);
process.exit(status);
