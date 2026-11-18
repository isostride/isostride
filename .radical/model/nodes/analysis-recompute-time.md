---
id: "3e608f71-04ae-42e1-aabe-194a07a8a79f"
type: "fitness-fn"
label: "Analysis recompute time"
cadence: "triggered"
characteristic: "performance-efficiency"
combine: "all"
invocation: "automated"
metrics: |
  compare.trend.duration.max <= 3 s
  compare.ab.duration.max <= 3 s
scope: "holistic"
trigger: "pull-request"
---

After the user changes a metric, context filter or splitting field, the trend or the A/B comparison (with its bootstrap uncertainty interval) is recomputed from block-instances.json within 3 s. Threshold from the user's answer: ≤3 s.
