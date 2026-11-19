---
id: "b123dc6d-e4bc-46b0-b2c2-af5f46cada59"
type: "scenario"
label: "Steady pass accepted"
given: "the Block Definition \"promenade northbound, pace 4:45–5:15, at least 8 minutes into the run\" with default tolerances: pace band 30 s/km wide, effort pace within 4% of pace, at least 90% of points within 30 m of the reference track in the same direction, coefficient of variation of speed below 0.15, mean speed over the 2 minutes before within 12% of the block's speed"
then: "the Block Instance is accepted into the comparison"
when: "a pass starts 12 minutes into the run, at 5:00/km, northbound, with 95% of points within 30 m of the reference track, effort pace 2% from pace, coefficient of variation of speed 0.08 and mean speed over the 2 minutes before 5% from the block's speed"
---
