---
id: "81327506-c58c-4955-be4b-844f7499091b"
type: "fitness-fn"
label: "Cached result reads no run file"
cadence: "triggered"
characteristic: "performance-efficiency"
combine: "all"
invocation: "automated"
metrics: "cache.repeat.run_files_read == 0"
scope: "atomic"
trigger: "pull-request"
---

A rule's segments asked for a second time, with the data unchanged, are read from derived/cache/: no run file is read (ADR "Results cached by a data stamp"). Measured by the integration test "Results kept for the data as it is".
