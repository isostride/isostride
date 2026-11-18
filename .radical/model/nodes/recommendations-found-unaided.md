---
id: "a0e2d555-fcc7-45bd-a3e4-a9e4403028cb"
type: "fitness-fn"
label: "Recommendations found unaided"
cadence: "triggered"
characteristic: "functional-suitability"
combine: "all"
invocation: "automated"
metrics: |
  acceptance.recommendations.promenade_segment == 1
  acceptance.recommendations.tempo_25min == 1
scope: "holistic"
trigger: "release"
---

On the author's data, with no block definitions entered, the system proposes the seaside promenade segment (about 1.1 km) and the 25-minute tempo on its own. Acceptance criterion 2.
