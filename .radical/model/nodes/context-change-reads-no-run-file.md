---
id: "cad3f241-093c-4f75-8cca-6cf44de04668"
type: "fitness-fn"
label: "Context change reads no run file"
cadence: "triggered"
characteristic: "performance-efficiency"
combine: "all"
invocation: "automated"
metrics: "context.change.run_files_read == 0"
scope: "atomic"
trigger: "pull-request"
---

A change of gear that detection does not read is written into the kept segments from the index: no run file is read (ADR "Results cached by a data stamp"). Measured by the integration test "Context change without detection".
