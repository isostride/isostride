---
id: "02308173-57c8-4489-9256-edd79dd7f2cb"
type: "scenario"
label: "Trend opens on a metric with a result"
gherkin: "And a metric chosen by the user stays chosen"
given: "a block whose heart rate was recorded in 2 instances only (no heart rate in the other 4 runs) and whose pace is recorded in all 6"
then: "it opens on pace, which has a verdict, and an empty metric names the reasons its instances were left out"
when: "the user opens its Trend"
---
