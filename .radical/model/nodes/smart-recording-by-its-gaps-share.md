---
id: "11af5b34-3c44-4eec-b29d-627760ddbb7e"
type: "scenario"
label: "Smart recording by its gaps' share"
given: "an hour at 5:00/km with a sample kept every 1 to 7 s, just over half the gaps of a second; and a run recorded every second with a pause and a few lost samples"
then: "the first is recorded smart (a pause from 10 s) and its pace is 5:00/km within 3 s; the second is recorded every second (a pause from 2 s)"
when: "the gap that counts as a pause is read from each, and the pace of the hour"
---
