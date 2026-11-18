---
id: "a0b2a9a9-debf-41fd-9464-f72b4daa6c91"
type: "step"
label: "Compute metric results"
children: "sequence"
condition: "for each metric whose minimum length the block meets (60 s for ground contact time, cadence, vertical oscillation and step length; 4 minutes for heart rate)"
order: 3
repeat: "0..n"
---

Metric mean and per-minute profile.
