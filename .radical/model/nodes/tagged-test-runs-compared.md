---
id: "475837a5-3b10-4b07-9852-d560980a6540"
type: "scenario"
label: "Tagged test runs compared"
gherkin: "And the system proposes the block \"Workout: test\" once 3 runs carry the tag"
given: "3 runs tagged with the workout type \"test\", one with a warm-up lap, a 20-minute lap at 4:10/km and a cool-down lap, two without laps"
then: "the run with laps gives its 20-minute lap, and each run without laps gives the run after its first 150 s and before its last 60 s"
when: "the block of workout type \"test\" detects its instances"
---
