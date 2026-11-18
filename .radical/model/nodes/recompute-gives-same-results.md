---
id: "1a7ad257-fd5a-4d25-b529-e09dd80998a7"
type: "scenario"
label: "Recompute gives same results"
gherkin: "And the trend and A/B results are the same as before"
given: "an imported folder with Block Definitions, Gear and Run Tags, and its trend and A/B results recorded"
then: "derived/ is rebuilt from scratch from the FIT files through steps 1–5 of the data flow"
when: "the user deletes derived/ and triggers \"Recompute everything\""
---
