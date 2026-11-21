---
id: "d5cb6789-12aa-4032-83f6-ecffddc23c26"
type: "scenario"
label: "Context change without detection"
given: "three runs imported and a kept block of whole runs, its segments detected"
then: "the first change writes the shoes into the 3 segments kept with no run file read and no detection; the second, touching a field the block filters by, detects the block again and finds its 3 segments"
when: "a pair of shoes is registered, then the block is made to filter by other shoes and those shoes registered"
---
