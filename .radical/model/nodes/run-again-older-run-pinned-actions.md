---
id: "2025174a-484c-4c66-b467-f4fba2cac8a1"
type: "scenario"
label: "Run again, older run, pinned actions"
given: "the pipeline's workflow and its set-up action; master at the run's commit, and at another"
then: "the reports are kept by the run, whatever the attempt; at the tip the deploy goes on, at another commit every step after the question is left out; every action of another repository is named by its commit with its version beside it"
when: "they are read, and the deploy asks whether its commit is still the tip of master"
---
