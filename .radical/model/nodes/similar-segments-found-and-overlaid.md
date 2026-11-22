---
id: "5e113a45-b3dc-4903-869c-0bcb5ddc1796"
type: "scenario"
label: "Similar segments found and overlaid"
given: "imported runs, several over the same route, and the Run screen of one with a segment of it selected"
then: "Compare holds unsaved segments named like \"Same route as <date> · <km> km · <pace> /km ±10 %\", each with Save, and opens on Efforts: the efforts at a like pace (within about 10 %), the selection marked \"your selection\", it and up to two others drawn on one chart of pace, heart rate and cadence by distance (\"This selection\" first), a row of figures for each, the cursor giving their values; one taken off, the elevation added and along the time, the chart follows; the same profile lists its efforts with the selection marked; the editor shows the same route as its part of each run and the pace band in Pace on average; Trends shows the route's change; saved, its Save button goes; Compare this run opens Compare on the run"
when: "the runner presses Compare similar by the selection, points at the chart, takes one drawn effort off, adds the elevation and draws along the time, looks at the same profile's efforts, opens the same route in the editor, then Trends, saves the same route from its chip; then, back on the run, presses Compare this run"
---
