---
id: "3ada0e31-9a55-47b5-bb5c-e160ba2e68ed"
type: "scenario"
label: "Several metrics analysed together"
gherkin: "And switching off 'Join points' or 'Trend line' hides those lines on every chart"
given: "a block in Analysis whose pace got faster and whose heart rate stayed the same"
then: "Analysis shows one 'Over time' chart for pace and one for heart rate on the same dates, each with the block's points joined by a line and its trend line, and the table of changes reads a change for pace and no detectable change for heart rate"
when: "the runner chooses pace and heart rate"
---
