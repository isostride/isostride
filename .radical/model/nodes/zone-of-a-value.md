---
id: "55d0b210-956f-4684-8298-a275017afb06"
type: "scenario"
label: "Zone of a value"
given: "heart rate zones with the boundaries 171, 114, 152 and 133 bpm, and pace zones with 5:30, 4:30 and 5:00 /km"
then: "the heart rate boundaries are sorted to 114, 133, 152, 171 and 140 bpm is in Z3, 100 bpm in Z1, 180 bpm in Z5; the pace boundaries run from the slowest, so 6:00 /km is in Z1 and 4:20 /km in Z4; 60, 70, 80 and 90 % of 190 bpm are 114, 133, 152 and 171; a folder with no settings file reads as the default zones of heart rate, pace and cadence; a saved file holds only the zones entered"
when: "the zones are read and values are placed in them"
---
