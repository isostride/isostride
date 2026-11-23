---
id: "29f50ece-2ad0-4c25-89e6-6e8a9a02f783"
type: "scenario"
label: "Run left right after a change"
given: "the Run screen of an imported run, the Settings screen slow to load"
then: "Settings opens (the run's link, written a quarter of a second after the change, does not keep the browser on the run); back on the run, heart rate is still the scale shown"
when: "the runner focuses heart rate and at once clicks Settings in the sidebar, then goes back"
---
