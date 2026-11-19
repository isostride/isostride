---
id: "a68e5272-8d6d-4b4e-b4c9-69e5daeeedbe"
type: "requirement"
label: "Heart rate window per block"
action: "compute heart rate for every instance of that block from that minute of the block to its end, the same for all its instances; without the attribute, heart rate is the mean over the whole block; show the heart rate start on the block as one of its attributes; effort and workout-type blocks start heart rate at minute 5 of the block by default"
ears_type: "optional"
feature: "a block definition sets a heart rate start (minutes after the start of the block)"
rationale: "The author (19 Nov 2026): heart rate measured differently is acceptable on the condition that all runs in the block are treated the same, kept as an attribute of the block; and heart rate never excludes a run on its own (\"Never exclude for HR\"). The model's choice: minute 5 as the default for effort and workout-type blocks, which follow a short warm-up."
---
