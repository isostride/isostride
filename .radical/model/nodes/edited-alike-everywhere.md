---
id: "f4a10542-8f6b-4d3e-997a-a4ae24a77d07"
type: "fitness-fn"
label: "Edited alike everywhere"
cadence: "triggered"
characteristic: "interaction-capability"
invocation: "automated"
scope: "atomic"
trigger: "pull-request"
---

Gear, tags, saved analyses, segments and a run's tags are edited the same way: Edit (a pencil) in the list, the dialog in the middle of the screen with Delete, Cancel and Save, nothing saved before Save, Delete asking first; Settings' forms with Cancel and Save.

Threshold: every test of the editors passes

Tool: e2e/performance.spec.ts, e2e/analysis.spec.ts, e2e/block-definition.spec.ts, e2e/metrics.spec.ts, e2e/run.spec.ts
