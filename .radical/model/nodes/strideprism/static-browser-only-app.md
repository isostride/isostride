---
id: "3151aa14-7b07-4207-a5e3-939b1c23c899"
type: "adr"
label: "Static browser-only app"
alternatives: "Desktop app; local server with a database."
consequences: "Data never leaves the computer; can be published as a plain web page; all processing must fit in the browser."
context: "One runner, own data, locally; no accounts or hosting in the MVP."
date: "2026-11-18"
decision: "Build Strideprism as a Next.js static export (React, TypeScript) that runs entirely in the browser, with no server and no database."
status: "accepted"
---
