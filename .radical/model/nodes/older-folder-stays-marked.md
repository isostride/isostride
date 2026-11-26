---
id: "cc69f5d6-c31f-47e1-af2e-4f458cfa4a75"
type: "scenario"
label: "Older folder stays marked"
given: "a folder built by an older version of the algorithms, and a new FIT file dropped into it; and load summaries of another version"
then: "the run is imported and the folder is still marked for its rebuild; summaries of another version of the summary or of the algorithms, or none, are not current"
when: "the new file is imported; and whether the summaries are current is asked"
---
