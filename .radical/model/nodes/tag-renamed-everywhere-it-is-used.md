---
id: "137d6b23-9735-4f78-bd91-1bdec71cf7df"
type: "scenario"
label: "Tag renamed everywhere it is used"
given: "the workout types easy, tempo and race, a run tagged tempo, a rule drawing from tempo and race runs, a segment \"Workout: tempo\" and a rule drawing from runs in Shoes A"
then: "the dictionary reads easy, threshold, race and the run is tagged threshold; the rule draws from threshold and race runs; the segment is \"Workout: threshold\"; the rule of shoes draws from Shoes B; an empty name, the same one, another tag's or an unknown tag changes nothing"
when: "tempo is renamed threshold, then Shoes A renamed Shoes B"
---
