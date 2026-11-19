---
id: "b2ecee7e-c463-4adf-9bdc-167842a010a9"
type: "scenario"
label: "Series of a run set from the data folder"
given: "a data folder with eight short runs a week apart since September, pace quickening 5 s/km a week, one titled \"COROS test\", five tagged easy"
then: "every run is read once with progress, pace gets a verdict of change, the fastest 2 min of the latest run starts at its minute 1, the maximum heart rates run 150 down to 143, the title and tag narrow the set, and a period with no runs gives an empty series"
when: "the series of the runs since September by their maximum are computed for pace, the fastest 2 min and heart rate in one pass, then for the titled run alone, the easy runs, and a period with no runs"
---
