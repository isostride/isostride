---
id: "316c4249-8e1b-4104-87de-f1cac5064fa7"
type: "fitness-fn"
label: "Recompute time"
cadence: "triggered"
characteristic: "performance-efficiency"
invocation: "automated"
metrics: "recompute.duration{runs=300} <= 15 min"
scope: "holistic"
trigger: "release"
---

“Recompute everything” over about 300 runs (the author's data since 3 Aug 2026) finishes within 15 minutes. Threshold from the user's answer: ≤15 min in total.
