---
id: "2eea07a3-376f-4995-bd4e-0129ff4704c2"
type: "scenario"
label: "Day state computed"
gherkin: "And no external data source was used"
given: "imported Runs on each of the 7 days before 2026-11-14"
then: "it holds the load from the previous 3 days and from the previous 7 days, matching the hand-checked values"
when: "the Day State of 2026-11-14 is computed"
---
