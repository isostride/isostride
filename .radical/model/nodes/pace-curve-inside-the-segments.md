---
id: "37de8939-dd70-4e96-827e-5901e301a79b"
type: "scenario"
label: "Pace curve inside the segments"
given: "a run of 30 minutes at 6:00/km with 10 minutes at 4:00/km in its middle"
then: "over the whole run every length up to 10 minutes is at 4:00, 15 minutes at 4:30 and 30 minutes at about 5:09, with no length beyond the run; inside the first 10 minutes the pace is 6:00 and nothing is longer than the stretch; of two segments the faster counts; across runs each length keeps its faster point"
when: "the fastest stretch of each length is taken over the whole run, inside its first 10 minutes only, and inside two segments; and the points of two runs are merged"
---
