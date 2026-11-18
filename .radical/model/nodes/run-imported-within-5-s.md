---
id: "6129c4ff-92cb-4550-b38c-7cd6bd728cf4"
type: "scenario"
label: "Run imported within 5 s"
given: "the sample FIT file of a 2-hour long run"
metrics: "ingest.import.duration.max{fixture=sample-fit} <= 5 s"
then: "the Run, its Samples, Laps and Windows are written within 5 s"
when: "the user imports it"
---
