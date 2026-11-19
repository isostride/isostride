import fs from 'node:fs';
import path from 'node:path';
import type { Reporter, TestModule } from 'vitest/node';

interface Entry { test: string; owner: string; ticket: string; since: string }

/**
 * Nightly reporter (FF "Flaky tests enter quarantine"): with retry 1, a test that passed
 * only on its retry is flaky. Appends them to reports/flaky.json and fails the run for any
 * not yet listed in quarantine.json.
 */
export default class FlakyReporter implements Reporter {
  private files: { flaky: string; quarantine: string };

  /** Vitest passes its own reporter options; only these two paths are read from them. */
  constructor(options: Partial<{ flaky: string; quarantine: string }> = {}) {
    this.files = { flaky: options.flaky ?? 'reports/flaky.json', quarantine: options.quarantine ?? 'quarantine.json' };
  }

  onTestRunEnd(modules: ReadonlyArray<TestModule>) {
    const flaky = modules.flatMap((m) => [...m.children.allTests()]).filter((t) => t.diagnostic()?.flaky).map((t) => `${path.relative(process.cwd(), t.module.moduleId)} › ${t.fullName.replace(/ > /g, ' › ')}`);
    const file = this.files.flaky;
    const seen: string[] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
    fs.writeFileSync(file, JSON.stringify([...new Set([...seen, ...flaky])], null, 2));
    const quarantine: Entry[] = JSON.parse(fs.readFileSync(this.files.quarantine, 'utf8'));
    const open = flaky.filter((name) => !quarantine.some((q) => q.test === name));
    if (open.length) {
      console.error(`flaky tests not yet in quarantine.json (list them within 1 working day):\n${open.join('\n')}`);
      process.exitCode = 1;
    }
  }
}
