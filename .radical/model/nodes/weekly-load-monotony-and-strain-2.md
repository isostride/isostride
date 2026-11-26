---
id: "43884c3e-c026-4889-84aa-bb73f65bacfe"
type: "scenario"
label: "Weekly load, monotony and strain"
given: "a week of a load of 100 on six days and none on Sunday, then a week of 200 on six days"
then: "the first week's load is 600, its monotony the mean daily load over its standard deviation, its strain the load times the monotony, its ramp the change of fitness within it (a few points down, not the load the averages start from); the heavier week's ramp is positive; a week of one load every day has no monotony"
when: "its load, monotony, strain and ramp rate are computed"
---
