---
id: "dd518dbe-e2c6-409f-8002-93257a9e0127"
type: "scenario"
label: "Overlap counted once"
given: "a steady-fragment Block Definition whose instances in one Run overlap: 10:00–18:00 and 14:00–22:00"
then: "the fragment 14:00–18:00 enters the Trend only once"
when: "the Trend of that definition is computed"
---
