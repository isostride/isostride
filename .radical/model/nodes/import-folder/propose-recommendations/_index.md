---
id: "f6a2be29-c917-4df0-8fca-d512cbc9ed3e"
type: "step"
label: "Propose recommendations"
children: "sequence"
condition: "for each Route Segment with at least 5 instances or workout structure in at least 3 workouts, not covered by a definition and not rejected before"
order: 6
repeat: "0..n"
---

Each becomes a Proposed Block Definition with origin recommendation.
