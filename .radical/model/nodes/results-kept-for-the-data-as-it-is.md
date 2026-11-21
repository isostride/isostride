---
id: "fb4d09da-7dc0-4127-9813-c478e3638ca5"
type: "scenario"
label: "Results kept for the data as it is"
given: "three runs imported and a rule of all runs"
then: "the first time they are computed from the 3 run files and kept; the second time they are read back with no run file read; a new stamp and a change of the blocks compute them again; an import with no new run keeps them"
when: "its segments are asked for twice, then after a new stamp, a change of the blocks and an import with no new run"
---
