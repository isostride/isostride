---
id: "23148674-0c62-4887-a3a2-346dbfb72e3b"
type: "fitness-fn"
label: "Derived files versioned"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
metrics: "derived.files_without_algorithm_version == 0"
scope: "atomic"
trigger: "pull-request"
---

Every file written to derived/ records the algorithm version that produced it, and manifest.json records the schema and algorithm versions.
