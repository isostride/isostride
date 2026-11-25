---
id: "06b7a5bf-cc1a-4a1a-bcd9-39269d0f629e"
type: "scenario"
label: "Loads of the four models"
given: "runs summarised: seconds at each heart rate, the normalised speed and power"
then: "each model gives its formula's number (30 min at half the reserve, 30 min in Z3 = 90, an hour at the threshold = 100), the maximum heart rate comes from the runs when not set (a run's peak more than 5 bpm above every other run's left out), and a run without what the model needs gets its duration at the median load per minute, marked estimated"
when: "their loads are computed by Banister TRIMP, Edwards TRIMP, rTSS and Power TSS"
---
