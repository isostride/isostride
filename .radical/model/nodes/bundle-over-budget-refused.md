---
id: "47356775-cc89-4247-9a0a-d47fd6e79209"
type: "scenario"
label: "Bundle over budget refused"
given: "a change that adds a large library to a route"
then: "it fails when the route's scripts pass 220 KB gzipped"
when: "the JavaScript budget check runs on the static export"
---
