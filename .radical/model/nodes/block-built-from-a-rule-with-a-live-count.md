---
id: "a23ad5ec-41a8-4148-9fcd-a762769f05a9"
type: "scenario"
label: "Block built from a rule with a live count"
given: "12 imported runs, the newest titled \"COROS test\" on the Runs screen"
then: "the count of segments updates with each entry (12 in 12 runs, then 1 in 1), the name follows the rule, the kept block lists the titled run as its segment; the second block is carried by the link and computed then, its segments are stretches of runs, and once kept it is the runner's own and the link names it"
when: "on the Analysis screen the runner builds a block of whole runs, types a distance range, then \"coros\" as the title, saves and uses it; then builds the fastest 5 minutes with the heart rate never below 100, uses it without keeping it, and keeps it from its chip"
---
