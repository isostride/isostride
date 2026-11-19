---
id: "28777e57-7a41-411d-b3c1-74461bd569ac"
type: "scenario"
label: "Broken journey blocks merge"
given: "a change that breaks one of: import, block-definition, trend, ab-comparison"
then: "the journey's test fails and the check fails naming it, so the change is not committed"
when: "npm run check runs its end-to-end tests"
---
