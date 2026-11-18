---
id: "e37710fa-222e-4d09-8b8a-f8c87e99ad7b"
type: "fitness-fn"
label: "Run file size"
cadence: "triggered"
characteristic: "performance-efficiency"
invocation: "automated"
metrics: "derived.run_file.size.max{fixture=sample-fit} <= 300 KB"
scope: "atomic"
trigger: "pull-request"
---

A derived run file (columnar JSON: samples and 10 s windows) stays within the expected 100–300 KB per run, so a few hundred runs fit comfortably in JSON.
