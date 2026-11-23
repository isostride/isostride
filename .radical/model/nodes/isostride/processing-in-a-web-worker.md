---
id: "90c9a1a8-2fb4-4052-b3f2-d96b6dc13e51"
type: "adr"
label: "Processing in a Web Worker"
alternatives: "Main thread with chunking; several workers."
consequences: "The worker gets the folder handle by postMessage; pages may not import the processing modules."
context: "Import and recomputation must not block the interface (≤5 s per run, ≤15 min for a full recompute)."
date: "2026-11-18"
decision: "Run import and recomputation in a dedicated Web Worker; analysis of the index files stays on the main thread."
status: "accepted"
---
