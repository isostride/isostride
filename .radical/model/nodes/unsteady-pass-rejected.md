---
id: "7d17eb04-3492-4f0e-aeeb-19d8c09e5022"
type: "scenario"
label: "Unsteady pass rejected"
gherkin: "And its reason for rejection is \"pace steadiness: coefficient of variation of speed 0.22, limit 0.15\""
given: "the same promenade Block Definition with a pace band 30 s/km wide and a coefficient of variation of speed below 0.15"
then: "the Block Instance is marked rejected"
when: "a pass has a coefficient of variation of speed of 0.22"
---
