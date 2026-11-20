---
id: "135d0fbc-2a7b-4ebf-ad0d-d1cf0333cefb"
type: "scenario"
label: "Run view survives a reload"
given: "the Run screen of an imported run"
then: "the link holds the range, the metrics, the scale, the lines and the axis; after the reload and after opening the run from the list the same lap is shown with the same lines, axis and scale"
when: "the runner shows lap 2, switches to overlaid lines by distance, focuses heart rate, then reloads the page, then goes to the Runs list and opens the same run again"
---
