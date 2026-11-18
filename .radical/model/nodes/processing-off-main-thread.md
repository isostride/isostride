---
id: "9ab44fc6-cc41-4349-925f-e27ed3d61d4e"
type: "fitness-fn"
label: "Processing off main thread"
cadence: "triggered"
characteristic: "performance-efficiency"
invocation: "automated"
metrics: "deps.violations{rule=processing-only-in-worker} == 0"
scope: "atomic"
trigger: "pull-request"
---

Import and recomputation code (lib/ingest, lib/prepare, lib/blocks, and the context join and day state in lib/context) is loaded only by the Web Worker, never by a page, so processing cannot block the interface. Pages may load lib/context's user-data modules (gear.ts, tags.ts), which only read and write user/. Checked by a test that scans the main-thread code (app, components, lib/client) for non-type imports of those modules.
