---
id: "ca9f71d9-a02c-4454-a417-41c4d4f6f610"
type: "scenario"
label: "Sensor change splits series"
gherkin: "And no trend line joins the wrist series to the arm-band series"
given: "promenade Block Instances measured with wrist heart rate until 2026-10-14 and with the arm band from 2026-10-15"
then: "the instances form two separate series, one per sensor"
when: "the user opens the heart rate Trend"
---
