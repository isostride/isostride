---
id: "dcc9c750-4930-43ec-b29a-96d8cc3419e7"
type: "component"
label: "File Store"
technology: "lib/fs, columnar JSON"
---

Writes derived/ as columnar, denormalized JSON with the algorithm version, updates manifest.json, deletes derived/ on recompute; never writes fit/ or user/.
