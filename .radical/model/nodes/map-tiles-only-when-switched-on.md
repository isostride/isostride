---
id: "c3fc17c7-6d32-4f4f-af0a-99941dace532"
type: "scenario"
label: "Map tiles only when switched on"
gherkin: "And the setting is remembered on the next visit"
given: "an imported run with GPS"
then: "with it off the page requests nothing from outside; with it on it requests only tiles from tile.openstreetmap.org, draws them under the route and shows \"© OpenStreetMap contributors\""
when: "the runner opens it with the map background off, then switches the map background on"
---
