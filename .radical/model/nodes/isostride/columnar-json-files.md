---
id: "cdb3ba69-24a7-48b5-a970-522185fa982b"
type: "adr"
label: "Columnar JSON files"
alternatives: "Parquet; IndexedDB."
consequences: "About 100–300 KB per run; Parquet can replace it later."
context: "Derived data must be portable, readable and rebuildable; open decision of section 11, settled by the user."
date: "2026-11-18"
decision: "Keep data as files in the runner's folder: columnar JSON (one array per field), user/ separate from derived/, denormalized index files for analysis."
status: "accepted"
---
