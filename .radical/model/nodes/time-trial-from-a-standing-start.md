---
id: "a1fab1e4-7b2d-4e1a-b353-7faa5260a5b8"
type: "scenario"
label: "Time trial from a standing start"
gherkin: |
  And with a flying start the second run gives its 3 km from minute 10, on the move, and any fragment of the first run starts more than 10 s after its stop
  And the block's card shows "standing start"
given: "the block \"3 km effort\" with a standing start, a run with a stop of 30 s after a 10-minute warm-up and then 3 km at 4:00/km, and a run with the same 3 km at 4:00/km flowing on from the warm-up without a stop"
then: "the first run gives one instance starting at the end of the stop, and the second run none"
when: "the instances are matched"
---
