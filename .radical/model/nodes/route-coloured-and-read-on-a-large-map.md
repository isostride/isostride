---
id: "0d40d086-746a-4574-9906-9fd84865b734"
type: "scenario"
label: "Route coloured and read on a large map"
given: "the Run screen of an imported run, heart rate the metric whose scale shows, heart rate zones in Settings and none for pace"
then: "the route is coloured by heart rate by Zones from Settings in at least three colours, the legend Z5 (≥ its boundary, red) to Z1 (below its boundary, green), their shares summing to the run; with This run the legend has five or six ranges, each holding at most 40 % of the run, and the run's lowest heart rate shows; with Pace the zones cannot be chosen and the note says Pace has no zones in Settings, and the legend's first row, dark red, is the fastest pace; pointing at the route shows Pace and its value at a time of the run; Zoom in raises the zoom by one, Zoom out twice brings it one under the start and Fit back to the start; Esc closes the large map"
when: "the runner presses Expand map, then This run, then chooses Pace, points at the route, presses Zoom in, Zoom out twice and Fit, and presses Esc"
---
