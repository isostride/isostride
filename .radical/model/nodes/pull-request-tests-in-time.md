---
id: "f6242d0c-671f-47c3-bab4-97c5d642bc0a"
type: "fitness-fn"
label: "Pull-request tests in time"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
metrics: "tests.duration <= 600 s"
scope: "atomic"
trigger: "pull-request"
---

npm run check times the unit and integration tests (Vitest, both projects) and records their wall time (reports/timing.json); a suite slower than 10 minutes fails the condition instead of quietly growing. Local only for now (the author's decision of 19 Nov 2026).

Threshold: the unit and integration tests finish within 10 minutes

Tool: Vitest timed by scripts/check.sh
