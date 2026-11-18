---
id: "bb318d07-1e0a-48d4-942c-8ecad440f7c5"
type: "scenario"
label: "Instance holds four layers"
gherkin: |
  And the before layer: minute and kilometre of the run, effort in the 2 minutes before the block, position in the workout structure
  And the run layer: shoes, heart rate sensor, workout type, technique cue
  And the day layer: load from previous days, temperature
  And its metric means and per-minute profile
given: "a Block Instance of the promenade segment detected in the Run of 2026-11-14"
then: "it shows its four context layers, first the block layer: pace, grade, duration, direction and the profile of metrics"
when: "the user opens it"
---
