---
id: "e1dd5d44-08ba-4641-b568-dc638874fbca"
type: "scenario"
label: "Short block, no HR result"
gherkin: "But it has no heart rate result, which needs at least 4 minutes"
given: "a Block Instance of 3 minutes"
then: "it has results for ground contact time, cadence, vertical oscillation and step length, which need at least 60 s"
when: "its metric results are computed"
---
