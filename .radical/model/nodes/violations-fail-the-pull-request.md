---
id: "fefd8bec-3f3f-4a8a-92ef-ff994442c642"
type: "fitness-fn"
label: "Violations fail the pull request"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
metrics: "deps.violations_total == 0"
scope: "atomic"
trigger: "pull-request"
---

npm run check runs the dependency check (scripts/boundaries.mjs), which exits non-zero on any violation and prints the rule with both parts and the file; the unit suite runs the same check (tests/unit/architecture.test.ts). Local only for now (the author's decision of 19 Nov 2026): a change is committed after npm run check passes.

Threshold: the dependency check runs on every change and fails on any violation, naming the rule and both parts

Tool: scripts/boundaries.mjs in npm run check
