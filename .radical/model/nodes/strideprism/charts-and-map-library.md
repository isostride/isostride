---
id: "839d8289-93cd-4d39-9e0b-4c96b2d659f9"
type: "adr"
label: "Charts and map library"
alternatives: |
  1. A charting library (uPlot, Recharts) and a map library with tiles (Leaflet, MapLibre): richer out of the box, but tiles are network requests, and the libraries weigh on the 200 KB budget per route.
  2. Canvas drawing: faster for very long series, harder to make accessible and to style through CSS tokens.
consequences: |
  • No network request for a map: the data stays on the computer (Data stays local).
  • The charts stay small and themeable; features such as zoom are built only when needed.
  • The map shows the route on a blank background, without streets.
context: "Screens need range selection on a chart and stretch selection on a map, synchronized, in light and dark themes."
date: "2026-11-18"
decision: "Own SVG components, no charting or map library: line charts with range selection, block and lap bands (components/charts.tsx), the route map drawn from the run's own coordinates without map tiles, and the trend and profile charts (components/TrendChart.tsx), all styled through the theme's tokens for the light and dark theme."
status: "accepted"
---
