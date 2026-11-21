---
id: "1c403970-896a-4fa7-b787-3f5c1b09976d"
type: "fitness-fn"
label: "Performance views read no run file"
cadence: "triggered"
characteristic: "performance-efficiency"
combine: "all"
invocation: "automated"
metrics: "performance.views.run_files_read == 0"
scope: "atomic"
trigger: "pull-request"
---

The Fitness markers, Load, Intensity and Efficiency tabs of Performance are drawn from derived/load-summaries.json and the index of runs: opening them opens no run file (ADR "Performance markers from summaries"). Measured by the end-to-end test "Load model set and form drawn", which logs the files the page opens.
