---
id: "cdc3cba3-c6e0-4935-ae73-d3ddd6fdd564"
type: "requirement"
label: "Minimum length per metric"
action: "yield no result for that metric, only for the metrics that meet their threshold"
ears_type: "unwanted-behaviour"
rationale: "Minimum length depends on the metric."
unwanted_condition: "a block is shorter than a metric's minimum length (60 s for ground contact time, cadence, vertical oscillation and step length; 4 minutes for heart rate)"
---
