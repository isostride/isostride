---
id: "bde80f97-62d4-41c9-b217-d60a4eaeb9fa"
type: "step"
label: "Write derived files"
children: "sequence"
order: 7
repeat: "1"
---

Write runs/<id>.json, runs-index.json, segments.json, block-instances.json and day-state.json as columnar, denormalized JSON with the algorithm version; add the imported files to manifest.json.
