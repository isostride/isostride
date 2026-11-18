---
id: "16887829-b274-4139-a4c8-97fc02ccb34a"
type: "scenario"
label: "Uncovered code refused"
given: "a pull request adding code"
then: "the quality gate fails and the pull request cannot be merged"
when: "its tests cover less than 80% of the new lines"
---
