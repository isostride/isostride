---
id: "7d30c4ac-66d7-4265-a753-2c40750a084c"
type: "fitness-fn"
label: "Flaky tests enter quarantine"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
metrics: "tests.flaky.unquarantined == 0"
scope: "atomic"
trigger: "nightly"
---

The nightly run (npm run nightly, scripts/nightly.sh) retries a failed test once, only to tell a flake from a failure; a reporter (tests/support/flakyReporter.ts) lists the tests that passed on retry in reports/flaky.json and fails the run for any that is not yet in quarantine.json, so a flake is entered within a day or the nightly stays red.

Threshold: 0 tests that passed only on retry in the nightly run without an entry in quarantine.json

Tool: Vitest (retry 1 with a reporter reading each test's diagnostic().flaky)
