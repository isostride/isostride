---
id: "035f9616-3378-4ba5-8a17-1b184317121f"
type: "scenario"
label: "Efficiency of a steady block"
gherkin: |
  And at 4:40/km with heart rate 150 bpm it is 1.43 metres per beat, an improvement
  And a run without heart rate has no efficiency
given: "a steady block at 5:00/km with heart rate 150 bpm"
then: "its efficiency is 1.33 metres per beat"
when: "its metrics are computed"
---
