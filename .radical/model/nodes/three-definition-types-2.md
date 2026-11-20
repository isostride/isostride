---
id: "4af56562-2cf3-4808-a6a5-5cd7d3dd13fd"
type: "scenario"
label: "Three definition types"
gherkin: |
  And a workout structure element takes a lap duration or distance, e.g. "25-minute tempo"
  And a steady fragment takes a pace range, e.g. 4:45–5:15/km
given: "a stretch selected on a run's chart or map"
then: "the user can choose one of three types: route segment, workout structure element or steady fragment within a pace range"
when: "the user makes a Block Definition of it"
---
