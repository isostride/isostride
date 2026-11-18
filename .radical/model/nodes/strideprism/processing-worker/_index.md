---
id: "d87e0d82-063d-4c7c-b571-c0a59b6a4ef7"
type: "container"
label: "Processing Worker"
technology: "Web Worker, TypeScript"
---

Runs import and “Recompute everything” (data flow steps 1–5) off the main thread so the interface never blocks; reports progress back by postMessage.
