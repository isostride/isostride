---
id: "e47a11bd-a986-4f7d-9a36-7e5d35a88365"
type: "scenario"
label: "Cycle refused"
given: "two parts where A depends on B"
then: "the rule check reports the cycle with both parts named and the change is not merged"
when: "a change makes B depend on A"
---
