---
id: "cc160c7c-2632-4d74-902c-56af70f51643"
type: "scenario"
label: "Device diagnosed"
given: "a folder of 2 runs imported"
then: "each read of the folder is timed (the listing, the FIT files, the index read first and again, settings, blocks, the last run file read and parsed, the run files one after another, a FIT file) and given as lines to copy, with the files and runs found and the time of a run file each"
when: "the diagnostics run"
---
