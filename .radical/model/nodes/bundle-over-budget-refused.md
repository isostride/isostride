---
id: "47356775-cc89-4247-9a0a-d47fd6e79209"
type: "scenario"
label: "Bundle over budget refused"
given: "a pull request that adds a large library to a route"
then: "it fails when the route's script transfer size passes 200 KB"
when: "Lighthouse CI runs against the preview"
---
