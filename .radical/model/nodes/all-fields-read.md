---
id: "4694d757-ae1c-4238-b0f7-1de633e81d8a"
type: "scenario"
label: "All fields read"
gherkin: |
  And every 1 s Sample has the expected speed, heart rate, cadence, ground contact time, vertical oscillation, step length, power, altitude, GPS position and temperature
  And every Lap has the expected start, end, duration and distance
given: "the sample FIT file \"tempo-25.fit\" with hand-checked expected values"
then: "the Run has the expected start time, source file, device, distance and duration"
when: "it is imported"
---
