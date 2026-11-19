---
id: "cdc3cba3-c6e0-4935-ae73-d3ddd6fdd564"
type: "requirement"
label: "Minimum block length"
action: "reject it for every metric with the reason, so that no metric is left out of an instance on its own"
ears_type: "unwanted-behaviour"
rationale: "A fragment shorter than a minute gives no meaningful mean of any metric. One decision per run (the author's decision of 19 Nov 2026, need \"Strideprism MVP specification\": \"Never exclude for HR\"): an accepted instance counts for every metric, heart rate included, computed from the block's heart rate window. The spec's per-metric minimum (4 minutes for heart rate) is dropped by that decision; the 60 s of the gait metrics becomes the block's minimum."
unwanted_condition: "a block instance is shorter than 60 s"
---
