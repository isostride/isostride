---
id: "a23ad5ec-41a8-4148-9fcd-a762769f05a9"
type: "scenario"
label: "Block from criteria with a live count"
given: "12 imported runs, the newest titled \"COROS test\" on the Runs screen"
then: "the count of runs meeting the criteria updates with each entry (12, then 1), the name follows the criteria, and the new block has the titled run as its accepted instance"
when: "the runner opens New block from criteria, types a distance range, then \"coros\" as the title, and creates the block"
---
