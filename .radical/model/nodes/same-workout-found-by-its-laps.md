---
id: "a014a923-cfeb-4a70-b3fc-72cd6469ec68"
type: "scenario"
label: "Same workout found by its laps"
gherkin: "And the same pattern can be defined from one run's laps on the Run screen"
given: "3 runs on different routes with the laps 2 km, 4 × (8 min and 1.5 min), cool-down, and one run with only 3 × 8 min"
then: "the pattern \"2 km + 4 × 8 min\" is proposed and each of the 3 runs gives 4 instances, its 8-minute laps, while the run with 3 × 8 min gives none"
when: "the system proposes blocks and the runner accepts the lap pattern"
---
