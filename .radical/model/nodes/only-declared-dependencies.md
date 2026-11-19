---
id: "5205b562-e8af-470c-910c-17248e62e3aa"
type: "fitness-fn"
label: "Only declared dependencies"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
metrics: "deps.undeclared == 0"
scope: "atomic"
trigger: "pull-request"
---

Each part (a folder of lib/, and app, components and workers) declares in its module.json the parts it may use ("uses"); the dependency check (scripts/boundaries.mjs) reads the files and fails on an import of a part the importing part does not list, naming both parts and the file. A new dependency means a one-line change to module.json, visible in review.

Threshold: 0 dependencies from a part on a part its module.json does not list

Tool: scripts/boundaries.mjs
