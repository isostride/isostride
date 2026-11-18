---
id: "7d30c4ac-66d7-4265-a753-2c40750a084c"
type: "fitness-fn"
label: "Flaky tests enter quarantine"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
scope: "atomic"
trigger: "nightly"
---

The nightly run retries a failed test once, only to tell a flake from a failure; a reporter lists the tests that passed on retry in reports/flaky.json and fails the run for any that is not yet in quarantine.json, so a flake is entered within a day or the nightly stays red. The gate itself skips the tests tagged @quarantine.

Threshold: 0 tests that passed only on retry in the nightly run without an entry in quarantine.json

Tool: Vitest (retry: 1 with a custom reporter reading each test's diagnostic().flaky); for the JVM: Gradle's test-retry plugin with failOnPassedAfterRetry off and its flaky report

```ts
// test/flakyReporter.ts (nightly vitest.config.ts: test.retry = 1, test.reporters = ['default', new FlakyReporter()])
import { writeFileSync } from 'node:fs'
import type { Reporter, TestModule } from 'vitest/node'
import quarantine from '../quarantine.json'   // [{ "test": "...", "owner": "...", "ticket": "...", "since": "2026-10-01" }]

export class FlakyReporter implements Reporter {
  onTestRunEnd(modules: ReadonlyArray<TestModule>) {
    const flaky = modules.flatMap((m) => [...m.children.allTests()]).filter((t) => t.diagnostic()?.flaky).map((t) => t.fullName)
    writeFileSync('reports/flaky.json', JSON.stringify(flaky, null, 2))
    const unquarantined = flaky.filter((name) => !quarantine.some((q) => q.test === name))
    if (unquarantined.length) {
      console.error('flaky tests not yet in quarantine (list them within 1 working day):\n' + unquarantined.join('\n'))
      process.exitCode = 1
    }
  }
}
```
