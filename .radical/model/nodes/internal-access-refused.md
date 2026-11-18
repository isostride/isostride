---
id: "d689e9f1-176b-482e-84f7-48e9fc823dad"
type: "scenario"
label: "Internal access refused"
given: "two parts, each with a published API"
then: "the rule check reports it and the build fails"
when: "one imports a file of the other that is not its index"
---
