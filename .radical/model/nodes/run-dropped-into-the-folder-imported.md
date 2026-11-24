---
id: "051990c0-368a-4666-b423-ff370d7cb2fe"
type: "scenario"
label: "Run dropped into the folder imported"
given: "a folder of 4 runs, just chosen"
then: "the 4 runs are imported by themselves and said so (“Imported 4 new runs from the folder.”), none marked New; then the fifth run is imported, the notice says “Imported 1 new run from the folder.” and the Runs screen counts 5 runs; the notice goes after a few seconds and the next look imports nothing"
when: "the folder is chosen; then a fifth run is dropped into the folder and the window comes back into view, then again with nothing new"
---
