---
id: "7764c1ed-26dd-49a2-9781-faf1777c8088"
type: "fitness-fn"
label: "Idempotent import"
cadence: "triggered"
characteristic: "reliability"
invocation: "automated"
metrics: "import.repeat.records_added == 0"
scope: "atomic"
trigger: "pull-request"
---

Importing the same folder a second time adds no Run, Sample or Lap records (key: start time). Acceptance criterion 1.
