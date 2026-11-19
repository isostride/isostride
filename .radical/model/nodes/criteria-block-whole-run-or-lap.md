---
id: "d72ff93a-47b3-4b30-937d-abc0d5f8fe77"
type: "scenario"
label: "Criteria block: whole run or lap"
given: "a workout of a 2 km warm-up, a 3 km lap at 4:00/km and a cool-down, an easy 8 km run, and a 4 km run at 4:00/km"
then: "the lap block finds the workout's effort lap alone, measured on its own; the run block finds the 4 km run alone, whole; the block's name says the criteria and its general conditions are off"
when: "a block asks for 2.5–3.5 km at 3:55–4:05 /km with laps as instances, and one for up to 4.5 km with whole runs"
---
