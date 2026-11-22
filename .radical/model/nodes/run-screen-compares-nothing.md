---
id: "ec1c74f4-8d5f-43b3-81f5-f53a068d8a64"
type: "fitness-fn"
label: "Run screen compares nothing"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
metrics: "run.cross_run_reads == 0"
scope: "atomic"
trigger: "pull-request"
---

The Run screen analyses one run: none of its files calls a search across runs (similar efforts, segments' efforts, curves or the curves of efforts in the worker); comparing is Compare's.

Threshold: 0 calls of a cross-run search in app/run

Tool: tests/unit/screens.test.ts
