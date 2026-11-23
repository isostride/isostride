---
id: "84bc4ef9-d9e6-4de4-a4e1-2b2e46e1ad73"
type: "adr"
label: "Run metrics on one chart"
alternatives: |
  1. Two or more y axes, one per metric: the reader cannot tell which line goes with which axis, and the crossing of lines suggests a relation that is an artefact of the scales.
  2. Indexed to a common base (percent of the run's mean): one scale, but the values read off it are not the metric's own.
  3. Keep the stack of lanes: the runner asked for one chart.
consequences: |
  • In bands the lines do not tangle and each has its scale beside it; overlaid, where two lines cross means nothing, as the note under the chart says.
  • Walking breaks and stops run to the edge of a band instead of flattening the running.
  • Raw draws every second as the watch recorded it; Smooth draws the rolling mean of the seconds over 1/30 of the range shown, 10 s to 2 min (components/chartZoom.ts, rollingMean), so the noise goes at the scale of a whole run and comes back when zoomed in; the tooltip reads the line drawn.
  • The line runs to the run's last record: a second without a value is no stop.
  • The average of a metric comes from the 10 s windows with movement, its min and max from the seconds, so the marks lie on the raw line; the trend and Pa:HR decoupling are numbers of a selection, not lines. Segments, comparisons, the models and the large map's colours stay on the 10 s windows.
  • More than 4 lines are not drawn at once; the runner turns one off to show another.
  • The block-making selection, the map and the cursor work as before.
context: "The runner asked for the metrics of a run laid over one chart (\"chce aby metryki byly nakladane na 1 wykres\"), with statistics of a selection and zoom. The metrics have different units (min/km, bpm, spm, ms), so one chart has no common y scale."
date: "2026-11-20"
decision: "One SVG chart (components/RunChart.tsx) replaces the stack of lanes: each shown metric (up to 4, the categorical series colours 1–4, a colour kept by a metric while it is shown) is scaled to its own range within the time range shown, between its 5th and 95th percentile, padded. The lines are drawn second by second from the file's records (app/run/metrics.ts, secondsOf; the runner's \"w coros widze metryke co 1 sekunde\"), nothing while standing or in a pause nor within 5 s of either, thinned to two points a pixel (components/charts.tsx, thinPoints). By default each line has its own band of the chart, the bands overlapping by a quarter, its short name and two round values (or its zone boundaries) in a gutter left of the plot (labels too near each other left out); \"Overlaid\" lays every line over the whole height with the focused metric's values only. Zones from the settings are stripes of a band in the colours of the zones, green to red. The focused metric draws the grid and the wash. The x axis spaces the chart by time or by distance: the domain stays in time and a time is placed at the distance run by then (components/chartZoom.ts, distanceMap), two axes under the plot. The range shown is held by the Run screen and is also the selection: a drag, the wheel or a pinch, the map (components/mapCamera.ts), the overview strip, a lap, a block or a link set it exactly, from 20 s to the whole run; the lines rescale to it, the route map fits the stretch run in it unless moved by hand, and the statistics, marks, trend and blocks work on it. Kept blocks are drawn only on demand. The marks take no pointer events, so a press and its release always land on the svg. The statistics of a range come from lib/blocks (rangeStats), over the 10 s windows with movement, their lowest and highest values second by second (withSecondExtremes)."
status: "accepted"
---
