---
id: "e25f213f-aaa5-4195-aa24-7954bb2e4956"
type: "scenario"
label: "Route segment derived"
gherkin: |
  And its reference track has a point every 10 m
  And its number of runs is 5
given: "5 imported Runs that each pass along the seaside promenade"
then: "a Route Segment of about 1.1 km exists along the promenade"
when: "the Runs are prepared"
---
