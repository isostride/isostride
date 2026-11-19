---
id: "b0e29eb0-ab9e-4b68-be1e-f42e6071ba9f"
type: "fitness-fn"
label: "Matches preliminary analysis"
cadence: "triggered"
characteristic: "functional-suitability"
combine: "all"
invocation: "automated"
metrics: |
  acceptance.promenade.steady_passes >= 5
  acceptance.promenade.hr_2026_11_14.abs_error{expected=135} <= 2 bpm
scope: "holistic"
trigger: "release"
---

The heart rate trend on the promenade segment, northbound, in the 4:45–5:15/km band agrees with the result of 18 Nov 2026 where the two measure the same thing: heart rate about 135 on 14 Nov (±2 bpm taken as “about”: the model's choice), and at least 5 steady passes. Acceptance criterion 3, on the author's data.

Revised on 19 Nov 2026 (the author's decision): the preliminary analysis counted pace as distance over total time, waits at the crossings (auto-pause) included, which put August–September passes run at 4:02–4:44/km into the band (34 passes, heart rate 149–154). The application measures pace while moving and rejects a pass stopped for more than 10 s, so those passes are not steady passes and the 34 and 149–154 are no longer conditions.
