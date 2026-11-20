---
id: "3cc77205-db9b-4ebb-b48a-c964e288db15"
type: "scenario"
label: "Context load by the model"
given: "three runs on consecutive days, 30 min at 150 bpm and 250 W each"
then: "each run's load is 90, then 50; the third run's load of the 3 days before is 180, then 100, and its form below zero; the second time no run file is read"
when: "the context is joined with Edwards TRIMP, then again with Power TSS against 250 W"
---
