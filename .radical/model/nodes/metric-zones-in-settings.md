---
id: "35cf3a74-f6aa-4e4e-9d29-09e491acb525"
type: "requirement"
label: "Metric zones in settings"
action: "keep them as the zones of that metric in the data folder, for the run chart to colour"
ears_type: "event-driven"
rationale: "The runner asked: \"w settingsach chce podawac zakresy\", then: \"dodaj domyslne strefy ... do testow\", and later, of the setup wizard: \"chodzi mi tez o strefy ... np. verrical osscilation, ground contact\", \"dodaj domyslne\". The model's choices: a Settings screen in the navigation; any metric of a run can have zones; the runner gives the boundaries between zones (pace as m:ss per km), the zones are named Z1, the easiest, to Zn; heart rate zones can be filled from the maximum heart rate at 60, 70, 80 and 90 % of it, pace and effort pace zones from the threshold pace at 129, 114, 106 and 99 % of it (Friel), power zones from the critical power at 80, 90, 100 and 115 % of it (Stryd); the zones are kept in user/settings.json of the data folder, like the runner's other files; until that file is saved, default zones apply (heart rate 114, 133, 152, 171 bpm; pace 6:00, 5:15, 4:45, 4:15 /km; cadence 160, 170, 180 spm; ground contact time 218, 249, 278, 309 ms and vertical oscillation 64, 82, 98, 116 mm, the bands of Garmin's running dynamics), and a button fills them in again."
trigger: "the runner enters the ranges of a metric on the Settings screen"
---
