---
id: "027b71b3-7b37-4e61-b765-489c9b4e9ecc"
type: "fitness-fn"
label: "Every numeric field read"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
metrics: "ingest.fields.dropped == 0"
scope: "atomic"
trigger: "pull-request"
---

Every numeric field of the records of the test FIT files (the runner's COROS files and the synthetic Garmin ones), standard or developer, but the time, the position, the distance and the running totals, is a metric of the imported run.
