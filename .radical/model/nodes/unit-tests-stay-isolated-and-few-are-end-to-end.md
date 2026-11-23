---
id: "a5a56b28-2ba1-46be-8b29-9d87439949a9"
type: "fitness-fn"
label: "Unit tests stay isolated and few are end-to-end"
cadence: "triggered"
characteristic: "maintainability"
combine: "all"
invocation: "automated"
metrics: |
  tests.unit.share >= 40 %
  tests.e2e.share <= 15 %
  tests.unit.over_100ms == 0
  tests.unit.network_calls == 0
scope: "atomic"
trigger: "pull-request"
---

The unit project (tests/unit) blocks the network in its setup (tests/support/noNetwork.ts), so a unit test that opens a connection or fetches fails; scripts/test-metrics.mjs reads the Vitest and Playwright reports and counts the tests of each kind; the unit tests' times come from a run of the unit project alone, without coverage instrumentation (npm run check runs it first), so a busy machine does not count against them. Integration tests (tests/integration) run on the author's FIT files and the versioned fixtures and are counted on their own (the author's decision of 19 Nov 2026: the real-data tests are the core of the verification here, so the pack's 70% unit and 10% end-to-end became 40% and 15%).

Threshold: 0 unit tests reach the network or run over 100 ms on the reference machine (the author's Mac), the limit scaled by the speed of the machine running them (scripts/machine-speed.mjs, never below 100 ms); unit tests at least 40% and end-to-end tests at most 15% of all tests

Tool: Vitest projects (unit, integration) and scripts/test-metrics.mjs
