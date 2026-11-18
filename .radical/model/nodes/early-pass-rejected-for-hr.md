---
id: "49ca3dc4-6bd9-4cc2-9e66-d0167cd137c8"
type: "scenario"
label: "Early pass rejected for HR"
given: "the promenade Block Definition, whose heart rate condition needs a block start at least 8 minutes after the start of the run"
then: "the Block Instance is rejected for heart rate with the reason \"block start 6 min, minimum 8 min\""
when: "a pass starts 6 minutes into the run"
---
