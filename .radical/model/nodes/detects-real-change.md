---
id: "226353bd-e1a4-4d07-b2db-bf1aecd05a15"
type: "fitness-fn"
label: "Detects real change"
cadence: "triggered"
characteristic: "functional-suitability"
invocation: "automated"
metrics: "compare.trend.changes_detected{dataset=author} >= 1"
scope: "holistic"
trigger: "pull-request"
---

Success criterion of step 1: the tool detects at least one change in the author's running that is larger than the noise. Measured automatically on every check (the author's decision of 19 Nov 2026, replacing a manual review every 6 weeks): an integration test imports the author's runs, accepts every suggested block, computes the trend of every metric for each, and counts the trends whose verdict is "change" (the fitted change larger than the noise threshold, its 95% interval clear of zero, at least 5 instances). The random-split negative test (at least 9 of 10 random splits without a change) guards against a rule that finds changes everywhere.

Threshold: at least 1 trend with the verdict "change" in the author's runs

Tool: Vitest (tests/integration/acceptance.test.ts) on the author's FIT files
