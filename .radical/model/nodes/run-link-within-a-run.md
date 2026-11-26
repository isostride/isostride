---
id: "fe13f8a6-fa61-4433-8bc0-aecb959409a4"
type: "scenario"
label: "Run link within a run"
given: "links to a run with a range of 600–1200 s, of 0–1e15 s, of 0–Infinity, a map zoom of 14 and one of −40"
then: "the range of 600–1200 s and the zoom of 14 are taken; the others are left out; a span of any length is given 48 time ticks at most"
when: "the view is read from the link"
---
