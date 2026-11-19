---
id: "16887829-b274-4139-a4c8-97fc02ccb34a"
type: "scenario"
label: "Uncovered code refused"
given: "a change adding code"
then: "the coverage check fails and with it npm run check"
when: "its tests cover less than 80% of the new lines and branches"
---
