---
id: "51211aa4-e661-4f5f-ad5b-b92e0aea064c"
type: "scenario"
label: "Run recorded smart"
given: "a run with a sample every 3 or 4 s, 10 minutes of it at 4:10/km and 160 bpm; and the same with a pause of 30 s"
then: "the gap that makes a pause is 10 s for it (2 s for a run recorded every second); the fastest 5 minutes has no stop, 160 bpm and a pace of 4:10; the pause of 30 s is still a stop"
when: "its fastest 5 minutes and the whole run are built as segments"
---
