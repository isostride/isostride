---
id: "59aee52c-dcea-4b4f-81a8-21f8a7ecab8f"
type: "scenario"
label: "Quality flags set"
gherkin: |
  And the Windows at the traffic light are flagged "stopped"
  And the Windows on the hill are flagged "grade"
  And the Windows without heart rate are flagged "missing sensor signal"
given: "a Run that stops at a traffic light at 12:00, climbs a hill at 20:00 and loses heart rate signal at 30:00"
then: "the 10 s Windows in the first 150 s of the Run are flagged \"first 150 s\""
when: "the Run is prepared"
---
