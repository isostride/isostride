---
id: "c6b6af5b-b448-4610-b76f-9621eaef5f67"
type: "requirement"
label: "No duplicate runs"
action: "skip that run without creating a duplicate record"
ears_type: "unwanted-behaviour"
rationale: "F1: the start time is the key of a Run; a repeated import adds no records."
unwanted_condition: "an imported FIT file holds a run whose start time equals the start time of a run already imported"
---
