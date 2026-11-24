---
id: "8e01d6f8-adf0-46be-8b36-9c17029cd39c"
type: "requirement"
label: "Recompute by itself on mismatch"
action: "recompute everything by itself, at once, and say so in a notice (“Rebuilt {n} runs for this version of the app.”), Recompute everything staying under Logs on the Data screen for a repair"
ears_type: "event-driven"
rationale: "Storage rule: version mismatch (the spec: “the application offers to recompute”). Changed on 24 Nov 2026: asked “Czy przeliczanie po zmianie algorytmu ma być samoczynne, jak import? Wtedy przycisk „Recompute everything” zostałby tylko jako awaryjny, schowany niżej.”, the runner answered “tak”; the button went under Logs after “to daj do zakladki rozwijanej jako logs ???”. Model's choice: when the app opens on the folder, before the import of new files."
trigger: "the application opens a data folder whose manifest.json records an algorithm version older than the application's"
---
