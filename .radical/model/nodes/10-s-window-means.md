---
id: "666b220b-2d5e-465f-b436-bf8287e09558"
type: "scenario"
label: "10 s window means"
gherkin: "And each Window holds the mean of each metric over its 10 Samples, matching the hand-checked values"
given: "an imported Run of 600 s with 1 s Samples"
then: "it has 60 Windows of 10 s"
when: "the Run is prepared"
---
