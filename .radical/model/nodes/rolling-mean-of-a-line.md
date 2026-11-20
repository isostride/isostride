---
id: "b7dbaa34-7d0f-4b7f-ba30-8780a49aeb4e"
type: "scenario"
label: "Rolling mean of a line"
given: "10 s windows alternating 140 and 160 bpm, with a stop of 3 windows in the middle"
then: "the smoothed values are 150 bpm away from the stop, the stop stays a break; the span is 60 s for 30 minutes, 10 s (no smoothing) for 5 minutes, and at most 120 s"
when: "they are smoothed over 1 minute, and the span is reckoned for a run of 30 minutes and of 5 minutes shown"
---
