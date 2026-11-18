---
id: "989ddea4-2268-46b9-a61d-ef102ca319a6"
type: "entity"
label: "Block Definition"
kind: "aggregate-root"
---

A recipe that says which fragments of a run qualify, e.g. “25-minute tempo”. Has a name, a type (route segment, workout structure element, steady fragment in a pace range), parameters, matching tolerances (defaults from the preliminary analysis, editable) and an origin (manual or recommendation). A recommendation waits for the user to accept or reject it; a rejected one is kept in user/ as rejected, so it is not proposed again. Not deleted in the MVP.
