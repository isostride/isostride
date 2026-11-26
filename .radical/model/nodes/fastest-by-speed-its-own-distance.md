---
id: "90f9c131-7c8c-4cf0-b58b-15a4585f04c5"
type: "scenario"
label: "Fastest by speed, its own distance"
given: "samples 5 and 30 s apart, 35 s of them covering 185 m and the last 30 s 180 m; and a run at 4 m/s whose samples at the start and the end of a minute hold no distance"
then: "the fastest 30 s are the last 30 (6 m/s), not the 35 s that covered more; the effort's distance is about 240 m, from 2.9 km into the run"
when: "the fastest 30 s are found, and an effort is built for that minute"
---
