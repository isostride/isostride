---
id: "9e732c9a-bfd3-4ba6-bfd2-55845c245cea"
type: "fitness-fn"
label: "Model change reads no run file"
cadence: "triggered"
characteristic: "performance-efficiency"
combine: "all"
invocation: "automated"
metrics: "load.model_change.run_files_read == 0"
scope: "atomic"
trigger: "pull-request"
---

When the load model or its parameters change, every run's load and the context are recomputed from derived/load-summaries.json: no run file is read (ADR "Load and form models"). Measured by the integration test "Context load by the model", which counts the run files read while the context is joined again with another model.
