---
id: "849939df-4bd6-415e-b844-a5d5a27b1425"
type: "fitness-fn"
label: "No dependency cycles"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
metrics: "deps.cycles == 0"
scope: "atomic"
trigger: "pull-request"
---

The dependency check (scripts/boundaries.mjs, npm run check:deps; tests/unit/architecture.test.ts runs it in the unit suite) fails on any cycle between parts, naming the parts and a file of each edge; a cycle among the files of one part is not counted.

Threshold: 0 cycles that run through more than one part

Tool: scripts/boundaries.mjs (the parts' module.json files)
