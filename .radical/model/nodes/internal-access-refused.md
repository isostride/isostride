---
id: "d689e9f1-176b-482e-84f7-48e9fc823dad"
type: "scenario"
label: "Internal access refused"
given: "two parts, compare and blocks, each with its index.ts"
then: "the dependency check reports it and npm run check fails"
when: "compare imports a file of blocks that is not its index"
---
