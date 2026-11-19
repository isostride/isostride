---
id: "b4dabb76-4038-490d-b824-c77328ba52ac"
type: "scenario"
label: "Auto-pause counts as stopped"
gherkin: "And the mean speed of the recorded samples alone would still read 5:00/km"
given: "a steady 5:00/km block during which the watch paused for 40 s at a crossing (no samples recorded)"
then: "it is rejected with the reason \"stopped: 40 s in the block, limit 10 s\""
when: "the instance is matched"
---

Speed variation (the coefficient-of-variation condition) is judged on the moving samples, and time spent standing is its own condition: samples below 0.5 m/s plus the gaps where the watch recorded nothing (auto-pause), at most 10 s. Found while comparing with the preliminary analysis of 18 Nov 2026: several August–September promenade passes held 55–110 s of auto-pause at crossings.
