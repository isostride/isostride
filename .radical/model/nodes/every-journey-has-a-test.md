---
id: "9804e6b1-e27c-49d3-af34-bad27cca134c"
type: "fitness-fn"
label: "Every journey has a test"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
metrics: "e2e.journeys.covered == 100 %"
scope: "atomic"
trigger: "pull-request"
---

A unit test (tests/unit/journeys.test.ts) lists the journeys the decision names and expects a spec file e2e/<journey>.spec.ts for each, with no test.only or test.skip left in any spec; a journey without a spec fails the test, so the list and the suite cannot drift apart.

Threshold: 100% of the journeys import, block-definition, trend, ab-comparison have a Playwright spec under e2e

Tool: Vitest over the e2e directory
