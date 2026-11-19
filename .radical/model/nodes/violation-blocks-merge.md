---
id: "6ce047df-9636-4978-af1d-efc85a227f6d"
type: "scenario"
label: "Violation blocks merge"
given: "a change that adds a forbidden dependency"
then: "the check fails naming the rule and both parts, and the change is not committed"
when: "npm run check runs the dependency check"
---
