---
id: "acb761e9-0316-41ae-bd9c-b06d49ea35da"
type: "scenario"
label: "Save only when changed"
given: "Settings › Models opened, nothing changed"
then: "no Save shows before the change; after it Save shows (disabled while the value is out of range); saved, it is gone again; the performance model card shows no Save and recompute until its load model is changed"
when: "the runner sets a threshold of the checks, then saves"
---
