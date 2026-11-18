---
id: "b0e29eb0-ab9e-4b68-be1e-f42e6071ba9f"
type: "fitness-fn"
label: "Matches preliminary analysis"
cadence: "triggered"
characteristic: "functional-suitability"
combine: "all"
invocation: "automated"
metrics: |
  acceptance.promenade.steady_passes == 34
  acceptance.promenade.hr_aug_sep.min >= 149 bpm
  acceptance.promenade.hr_aug_sep.max <= 154 bpm
  acceptance.promenade.hr_2026_11_14.abs_error{expected=135} <= 2 bpm
scope: "holistic"
trigger: "release"
---

The heart rate trend on the promenade segment in the 4:45–5:15/km band reproduces the result of 18 Nov 2026: 34 steady passes, heart rate 149–154 in August and September and about 135 on 14 Nov (±2 bpm taken as “about”: the model's choice). Acceptance criterion 3, on the author's data.
