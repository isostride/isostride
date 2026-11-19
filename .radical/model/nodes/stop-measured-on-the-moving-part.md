---
id: "b4dabb76-4038-490d-b824-c77328ba52ac"
type: "scenario"
label: "Stop measured on the moving part"
gherkin: |
  And a block with a 20 s stop in its first minutes keeps its heart rate
  And one with a 5 s stop in its last 2 minutes does not
given: "a steady 5:00/km block 10 minutes into the run, during which the watch paused for 40 s at a crossing (no samples recorded)"
then: "it is accepted with pace 5:00/km from the moving samples, and its heart rate is not used, with the reason \"stopped 40 s in the block, limit 30 s\""
when: "the instance is matched"
---

Speed variation (the coefficient-of-variation condition) is judged on the moving samples, and time spent standing is its own condition: samples below 0.5 m/s plus the gaps where the watch recorded nothing (auto-pause), at most 10 s. Found while comparing with the preliminary analysis of 18 Nov 2026: several August–September promenade passes held 55–110 s of auto-pause at crossings.
