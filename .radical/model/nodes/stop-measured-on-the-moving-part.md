---
id: "b4dabb76-4038-490d-b824-c77328ba52ac"
type: "scenario"
label: "Stop measured on the moving part"
gherkin: "And a block with a stop in its last 2 minutes is accepted the same way, every metric included"
given: "a steady 5:00/km block 10 minutes into the run, during which the watch paused for 40 s at a crossing (no samples recorded)"
then: "it is accepted with pace 5:00/km and heart rate from the moving samples, and its stop of 40 s is recorded in its context"
when: "the instance is matched"
---

Speed variation (the coefficient-of-variation condition) is judged on the moving samples, and time spent standing is its own condition: samples below 0.5 m/s plus the gaps where the watch recorded nothing (auto-pause), at most 10 s. Found while comparing with the preliminary analysis of 18 Nov 2026: several August–September promenade passes held 55–110 s of auto-pause at crossings.
