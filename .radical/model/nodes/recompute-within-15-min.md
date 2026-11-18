---
id: "929d3f69-cf3e-4522-95d1-a5424b36e37f"
type: "scenario"
label: "Recompute within 15 min"
given: "the author's data: about 300 Runs since 3 Aug 2026"
metrics: "recompute.duration{runs=300} <= 15 min"
then: "the recompute finishes within 15 min in total"
when: "the user triggers \"Recompute everything\""
---
