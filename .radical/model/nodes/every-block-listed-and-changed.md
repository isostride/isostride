---
id: "8ee457a0-fea5-4014-981a-799594c60b47"
type: "scenario"
label: "Every block listed and changed"
given: "12 imported runs, the newest titled \"COROS test\""
then: "the editor counts 12, then 1 segment in 1 run as the rule narrows; the screen lists the block with its stretch, 1 segment, 1 run and the latest date; Analysis lists its segment, the titled run; after the edit the stretch reads Fastest 5 min; Esc closes the editor; after the delete the screen says there is no block yet"
when: "the runner opens Blocks (after Runs in the menu), makes a new block of whole runs 0.5–100 km titled \"coros\", opens it in Analysis, edits it to the fastest stretch with the heart rate never below 100, opens the editor and closes it with Esc, then deletes the block from its row and confirms"
---
