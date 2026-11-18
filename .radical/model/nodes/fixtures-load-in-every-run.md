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

Vitest's global setup copies the sample FIT files from tests/fixtures into a fresh temporary data folder for each run and loads each file's hand-checked expected values (expected.json beside it); a fixture without expected values, or one that fails to parse, fails the setup and with it the run.

Threshold: every test run starts from a fresh temporary data folder with all FIT fixtures and their expected values loaded without error
