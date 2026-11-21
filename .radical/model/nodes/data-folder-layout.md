---
id: "50fdf59d-10e8-4536-ad17-d8805203fa4b"
type: "requirement"
label: "Data folder layout"
action: "write its data into a strideprism/ subfolder of the data folder holding user/ (gear.json, run-tags.json, block-definitions.json, settings.json), what the runner enters, and derived/, the 1 folder of everything computed from the FIT files (manifest.json with the schema and algorithm versions and the list of imported files, runs/<id>.json, runs-index.json, segments.json, block-instances.json, day-state.json and the rest), and move a manifest.json found at strideprism/ into derived/"
ears_type: "ubiquitous"
rationale: "The data is portable, readable and can be versioned or synced with any tool. The runner asked that everything computed from the source files be in one folder (\"czy wszystkie obliczone dane z plikow zrodlowych sa w 1 katalogu?\", then \"tak chce\" to moving manifest.json into derived/), so deleting derived/ resets the import and keeps the runner's entries. Model's choice: a manifest.json left at strideprism/ by an earlier version is moved on first reading."
---
