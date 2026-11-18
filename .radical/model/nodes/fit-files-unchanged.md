---
id: "00f166c6-73f4-47e3-a804-04ad4bdb7785"
type: "scenario"
label: "FIT files unchanged"
given: "the checksums of every file in fit/ are recorded"
then: "every file in fit/ has the same checksum and no file was added to or removed from fit/"
when: "the user imports the folder and then triggers \"Recompute everything\""
---
