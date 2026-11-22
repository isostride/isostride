---
id: "2065821d-656d-48ea-8619-7fc1a7b22651"
type: "fitness-fn"
label: "Older blocks find the same efforts"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
metrics: "blocks.legacy_differing == 0"
scope: "atomic"
trigger: "pull-request"
---

A block of an older kind (here a workout lap of 25 minutes) is read as the rule it is and finds the same efforts as that rule; the integration test of selection records whether they differ.

Threshold: 0 older blocks whose efforts differ from their rule's

Tool: tests/integration/selection.test.ts
