---
id: "9cfc48bd-cdf2-4149-8d34-802f3393de9c"
type: "fitness-fn"
label: "Historical import clean"
cadence: "triggered"
characteristic: "functional-suitability"
combine: "all"
invocation: "automated"
metrics: |
  import.errors{dataset=author} == 0
  import.runs_missing_developer_fields{dataset=author} == 0
scope: "holistic"
trigger: "release"
---

All of the author's runs since 3 Aug 2026 import without errors, including COROS developer fields. Acceptance criterion 1; run locally on the author's data before a release.
