---
id: "6ce047df-9636-4978-af1d-efc85a227f6d"
type: "scenario"
label: "Violation blocks merge"
given: "a pull request that adds a forbidden dependency"
then: "the dependency check fails naming the rule and both parts, and the pull request cannot be merged"
when: "the build runs"
---
