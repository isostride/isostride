---
id: "d4c8693a-3fc7-4b32-ba42-56c6eda61fbc"
type: "scenario"
label: "Promenade heart rate trend"
gherkin: |
  And heart rate is 149–154 in August and September
  And heart rate is about 135 on 14 Nov
  And the Noise Threshold and gear changes are drawn, gear changes as vertical lines
given: "the author's Runs since 3 Aug 2026 and the Block Definition of the promenade segment in the 4:45–5:15/km band"
then: "the Trend shows 34 steady passes"
when: "the user opens its Trend for heart rate"
---
