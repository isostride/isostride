---
id: "ea596479-434c-47bf-955f-e01d8bb2dddc"
type: "component"
label: "Shared Kernel"
technology: "TypeScript types"
---

The run contracts every part shares (samples, laps, 10 s windows, run and index files) and the schema and algorithm versions: types and constants only, no I/O, no package, at most 5% of the source lines (ADR "A small shared kernel"). Compiled into both the Web App and the Processing Worker.
