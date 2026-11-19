---
id: "839d8289-93cd-4d39-9e0b-4c96b2d659f9"
type: "adr"
label: "Charts and map library"
alternatives: |
  1. A charting library (uPlot, Recharts) and a map library with tiles (Leaflet, MapLibre): richer out of the box, but tiles are network requests, and the libraries weigh on the 200 KB budget per route.
  2. Canvas drawing: faster for very long series, harder to make accessible and to style through CSS tokens.
consequences: |
  • With the map background off, no network request for a map: the data stays on the computer (Data stays local).
  • With it on, the tile server learns the area of the route shown, nothing else; its usage policy applies (light personal use, attribution shown).
  • The charts and the map stay small and themeable; features such as zoom are built only when needed.
context: "Screens need range selection on a chart and stretch selection on a map, synchronized, in light and dark themes."
date: "2026-11-18"
decision: "Own SVG components, no charting or map library: line charts with range selection, block and lap bands (components/charts.tsx), the route map drawn from the run's own coordinates in Web Mercator, and the trend and profile charts (components/TrendChart.tsx), all styled through the theme's tokens for the light and dark theme. The map background, when the runner switches it on (off by default), is OpenStreetMap's standard tiles drawn as images under the route, with their attribution; darkened through a CSS filter in the dark theme."
status: "accepted"
---
