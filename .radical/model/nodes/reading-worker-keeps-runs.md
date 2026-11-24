---
id: "f1c03f5c-4092-4ddf-aaa9-efc717d56dc7"
type: "fitness-fn"
label: "Reading worker keeps runs"
cadence: "triggered"
characteristic: "performance-efficiency"
combine: "all"
invocation: "automated"
metrics: "worker.kept_run_file.reads_again == 0"
scope: "atomic"
trigger: "pull-request"
---

The reading worker keeps the run files it read (ADR "One reading worker, files kept"): a run read again while the data stay as they are is not read from the folder again; the oldest are let go past the limit and all are forgotten when the data change. Measured by the unit test "Read once, the oldest let go, forgotten when the data change".
