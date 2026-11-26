---
id: "8e01d6f8-adf0-46be-8b36-9c17029cd39c"
type: "requirement"
label: "Recompute by itself on mismatch"
action: "recompute everything by itself, at once, and say so in a notice (“Rebuilt {n} runs for this version of the app.”), Recompute everything staying under Logs on the Data tab of Settings for a repair"
ears_type: "event-driven"
rationale: "Storage rule: version mismatch (the spec: “the application offers to recompute”). Changed on 24 Nov 2026: asked “Czy przeliczanie po zmianie algorytmu ma być samoczynne, jak import? Wtedy przycisk „Recompute everything” zostałby tylko jako awaryjny, schowany niżej.”, the runner answered “tak”; the button went under Logs after “to daj do zakladki rozwijanej jako logs ???”. Model's choice: when the app opens on the folder, before the import of new files. On 26 Nov 2026 a review of the whole app (the runner's \"przegladnij aplikacje raz jeszcze ... pod katem modeli ale nie tylko\"), found an import of new files stamping the manifest with the app's version though only the new runs were built by it, so the mark for a rebuild was lost; and the load summaries of an older version read as they were by the Dashboard's model tiles and a run's D′ balance; the runner: \"tak zacznij od poczzatku ... i przejdz przez wszystkie\". Model's choices: the manifest keeps the version it was built with until a rebuild, which starts from an empty one; as the app opens, load summaries of another version of the summary or of the algorithms are made again, and the screens that read them follow."
trigger: "the application opens a data folder whose manifest.json records an algorithm version older than the application's"
---
