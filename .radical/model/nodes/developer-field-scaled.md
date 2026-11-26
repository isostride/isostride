---
id: "27c12241-657f-474e-84b8-fdebce5c7eb7"
type: "scenario"
label: "Developer field scaled"
given: "a developer field described with a scale of 10 and an offset of 20, its values 425, 435, 445 in the file, and one described with neither"
then: "the first reads 22.5, 23.5, 24.5; the second as the file holds it"
when: "the file is read into a run"
---
