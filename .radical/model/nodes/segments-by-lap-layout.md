---
id: "993f5e93-1328-41e0-bd41-40d71f889daf"
type: "requirement"
label: "Segments by lap layout"
action: "offer, in step 2 of the editor (Run layout), the layouts of laps found in the runs, each with the number of its runs, each identical (the same laps from the warm-up to the cool-down) or similar (the same reps, as many and as long, whatever the warm-up, the recoveries and the cool-down); with The reps chosen there, the effort laps of the runs of the layout are the segments; otherwise the layout chooses the runs the segment is taken from"
ears_type: "event-driven"
rationale: "The runner asked: \"dodaj mi do kreatora segmentow opcje wyboru identycznego lub podobnego schematu lapow .. ma na mysli np. wszystkie gdzie jest 3 x 10 min\"; asked what the segment is, answered \"Jedno i drugie\" (the reps as a shape and a filter of the runs); asked how the layout is chosen, \"Z listy znalezionych (Recommended)\"; asked what similar means, \"Te same serie (Recommended)\". Then, of the layout chosen twice, \"czy to nie jest redundance ?\", and asked where it stays: \"Tylko w kroku 2\" (the filter of the runs dropped). Model's choices: a layout and its reps read as the Segments' lap patterns read them (set laps by time or distance, effort laps those faster than the run's average pace, in most of the layout's runs); identical as the lap patterns match (as many laps, each set lap within 3 % of its target); the layouts listed from the facts the detection keeps of each run (derived/blocks-cache.json), the most runs first, only those with an effort lap and at least two set laps; for a similar layout the effort laps of each run its own; names \"Reps of 2 km + 3 × 10 min\" and \"Reps of 3 × 10 min, any layout\"."
trigger: "the user makes or edits a segment in the segment editor"
---
