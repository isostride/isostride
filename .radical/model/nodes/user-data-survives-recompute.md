---
id: "79088551-a2af-4e96-b5be-32942b1f662c"
type: "scenario"
label: "User data survives recompute"
given: "user/gear.json, user/run-tags.json and user/block-definitions.json with the user's entries, their checksums recorded"
then: "the three files in user/ have the same checksums"
when: "the user triggers \"Recompute everything\""
---
