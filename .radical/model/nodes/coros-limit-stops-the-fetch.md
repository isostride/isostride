---
id: "e5dd9207-a3cb-45af-bf6c-aff883a45596"
type: "scenario"
label: "COROS limit stops the fetch"
given: "a folder with nothing fetched from COROS, and two runs on COROS"
then: "the first file is kept and the fetch says COROS's words; the day of the last fetch does not move, so the next fetch asks the same days and fetches only the second run, both then imported; a run in progress is left for the next fetch while the other is fetched"
when: "COROS refuses the second file with its limit of 50 files in 24 h, then the runner fetches again; or the first run is still in progress"
---
