---
id: "28777e57-7a41-411d-b3c1-74461bd569ac"
type: "scenario"
label: "Broken journey blocks merge"
given: "a pull request that breaks one of: import, block-definition, trend, ab-comparison"
then: "the journey fails and the pull request cannot be merged"
when: "its ephemeral environment is tested"
---
