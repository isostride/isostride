---
id: "5a685c04-7952-4a63-b559-39d36109a02c"
type: "scenario"
label: "Import cut off finished"
given: "two FIT files whose runs were read and written to the index, the import cut off before their context was joined"
then: "the manifest marked the runs as waiting and the folder as pending; the import imports nothing and finishes the one before: every run has its load and form, the segments are found, the mark is cleared"
when: "the next import runs with no new file"
---
