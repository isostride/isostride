---
id: "670674aa-8d04-4ca9-9389-9afb3f2dee44"
type: "scenario"
label: "Heart rate source recorded"
gherkin: "And wrist heart rate and arm-band heart rate are two different series"
given: "one run recorded with wrist heart rate and one recorded with an arm-band heart rate sensor"
then: "the heart rate of each Sample records its source device: the watch for the first Run, the arm band for the second"
when: "both are imported"
---
