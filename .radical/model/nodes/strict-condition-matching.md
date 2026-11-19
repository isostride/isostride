---
id: "e994cb73-b961-4a9d-8334-de1cd8a785e4"
type: "requirement"
label: "Strict condition matching"
action: "accept an instance into a comparison only when it meets every matching condition of its definition, by default: pace in the same 30 s/km wide band; effort pace differing from pace by at most 4% (grade); for a route segment at least 90% of points within 30 m of the reference track, in the same direction; coefficient of variation of speed below 0.15; mean speed over the 2 minutes before the block within 12% of the block's speed; time stopped does not reject an instance: its metrics and conditions are computed from the moving samples (the stops and 10 s around each left out); an accepted instance counts for every metric, heart rate included"
ears_type: "ubiquitous"
rationale: "First step of a comparison: strict matching of conditions. Stops at the lights (the author's decision of 19 Nov 2026, \"Measure on the moving part\"): a stop does not reject the pass, its metrics come from the moving samples. One decision per run (the author's decision of 19 Nov 2026, need \"Strideprism MVP specification\": \"Never exclude for HR\"): an accepted instance counts for every metric, heart rate included, computed from the block's heart rate window."
---
