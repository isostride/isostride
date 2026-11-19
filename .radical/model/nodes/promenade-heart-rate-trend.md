---
id: "d4c8693a-3fc7-4b32-ba42-56c6eda61fbc"
type: "scenario"
label: "Promenade heart rate trend"
gherkin: |
  And heart rate is about 135 on 14 Nov
  And the Noise Threshold and gear changes are drawn, gear changes as vertical lines
given: "the author's Runs since 3 Aug 2026 and the Block Definition of the promenade segment in the 4:45–5:15/km band"
then: "the Trend shows at least 5 steady passes, none from August or September"
when: "the user opens its Trend for heart rate"
---

Revised on 19 Nov 2026 (the author's decision): the preliminary analysis of 18 Nov counted pace as distance over total time, waits at the crossings included, and found 34 passes with heart rate 149–154 in August and September. Measured while moving, with time stopped (auto-pause included) limited to 10 s, those August–September passes were run at 4:02–4:44/km with 55–110 s of waiting each, so none is a steady pass in the band; heart rate on 14 Nov (135) agrees.
