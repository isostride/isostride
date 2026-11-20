---
id: "a5594f9e-b2dd-4555-9cfe-84de48874542"
type: "scenario"
label: "Zones set and coloured"
given: "an imported run with heart rate, and no settings saved"
then: "first the default zones stripe the heart rate, pace and cadence bands; the settings keep the boundaries 114, 133, 152 and 171 bpm as zones Z1 to Z5 in user/settings.json; the run chart then stripes only the heart rate band by them, with their names, and the tooltip names the zone of the heart rate under the pointer"
when: "the runner opens the run, then fills the heart rate zones from a maximum of 190 bpm on the Settings screen, saves and opens the run again"
---
