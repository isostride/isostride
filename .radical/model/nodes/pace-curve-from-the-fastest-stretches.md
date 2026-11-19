---
id: "37de8939-dd70-4e96-827e-5901e301a79b"
type: "scenario"
label: "Pace curve from the fastest stretches"
given: "the series of a run set's fastest stretches: three runs with 1-minute bests of 3:40, 3:30 and 3:50 /km and 10-minute bests of 4:10 and 4:00 /km, no run long enough for 30 minutes"
then: "its points are 1 min at 3:30 from the second run and 10 min at 4:00 from the run that holds it, in order of length, and 30 min is left out"
when: "the pace curve is taken from them"
---
