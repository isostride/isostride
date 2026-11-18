---
id: "1660cc95-0e4b-4a00-9892-b2ebbcc0f88b"
type: "fitness-fn"
label: "Import time per run"
cadence: "triggered"
characteristic: "performance-efficiency"
invocation: "automated"
metrics: "ingest.import.duration.max{fixture=sample-fit} <= 5 s"
scope: "atomic"
trigger: "pull-request"
---

Importing one FIT file (parse, samples, laps, 10 s windows, write) takes at most 5 s, measured on the sample FIT files in tests/. Threshold from the user's answer: ≤5 s per run.
