---
id: "d7d1886c-0eda-4086-931c-fe3a0b2be1d9"
type: "fitness-fn"
label: "No data leaves computer"
cadence: "triggered"
characteristic: "security"
combine: "all"
invocation: "automated"
metrics: |
  app.network.requests{origin=external} == 0
  app.network.requests{origin=other-than-map-tiles,map=on} == 0
scope: "holistic"
trigger: "pull-request"
---

Through a full import, recompute, trend, A/B and export journey, with the map background off (its default), the application makes no network request beyond loading its own static files: there is no server and the data never leaves the computer. With the map background switched on (requirement "Map background"), the only requests to the outside are OpenStreetMap tiles of the area shown (e2e/map.spec.ts stands in for the tile server).
