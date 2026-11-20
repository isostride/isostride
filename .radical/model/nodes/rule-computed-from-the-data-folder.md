---
id: "b2ecee7e-c463-4adf-9bdc-167842a010a9"
type: "scenario"
label: "Rule computed from the data folder"
given: "a data folder with eight short runs a week apart, pace quickening 5 s/km a week, five of them tagged easy"
then: "both come from one pass over the eight run files, read with progress, nothing is written; the fastest 2 minutes of the latest run start at its minute 1 at 3:25 /km; the easy runs carry their maximum heart rates; alone, the easy rule reads only the five runs it draws from"
when: "two rules are computed together, the fastest 2 minutes of every run and the easy runs whole by their maximum, then the easy rule alone"
---
