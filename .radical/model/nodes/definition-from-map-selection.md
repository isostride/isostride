---
id: "87cc4620-281c-4697-bafe-41bf44e61a99"
type: "scenario"
label: "Definition from map selection"
gherkin: "And it is saved in user/block-definitions.json"
given: "the Run screen of the long run of 2026-11-14"
then: "a Block Definition \"promenade northbound, pace 4:45–5:15, at least 8 minutes into the run\" exists with origin \"manual\""
when: "the user selects the promenade northbound on the map and creates a Block Definition from it with pace 4:45–5:15 and at least 8 minutes into the run"
---
