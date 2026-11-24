---
id: "5e606384-c6f9-4d1e-9338-340d7a5d79e0"
type: "scenario"
label: "COROS runs fetched once"
given: "a folder with nothing fetched from COROS, and a COROS account whose last 30 days hold two runs and a walk"
then: "COROS is asked for the runs (100–103) of 25 Oct–24 Nov 2026; the two runs' FIT files are written into fit/ under COROS's names and imported (2 runs); user/coros.json keeps them by labelId with the day 2026-11-24; the second fetch asks from 23 Nov and asks for no file"
when: "the runner fetches runs from COROS, then again a day later"
---
