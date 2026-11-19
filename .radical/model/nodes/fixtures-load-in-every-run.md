---
id: "aaaccc51-012a-4c14-9315-82eaa46770f1"
type: "fitness-fn"
label: "Fixtures load in every run"
cadence: "triggered"
characteristic: "maintainability"
combine: "all"
invocation: "automated"
metrics: |
  fixtures.load_errors == 0
  fixtures.without_expected_values == 0
scope: "atomic"
trigger: "pull-request"
---

The integration project's global setup (tests/support/globalSetup.ts) copies the versioned FIT fixtures from tests/fixtures into a fresh temporary data folder for each run and loads their hand-checked expected values (tests/fixtures/expected.json); a fixture without expected values, or one that is not a FIT file, fails the setup and with it the run. The fixtures are synthetic runs (scripts/make-fixtures.mjs), not the author's: their health data stays out of the repository.

Threshold: every test run starts from a fresh temporary data folder with all FIT fixtures and their expected values loaded without error
