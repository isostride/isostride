---
id: "d70ace61-b027-43c3-93cb-4df7cfb1b3a9"
type: "fitness-fn"
label: "Only public APIs used"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
metrics: "deps.internal_access == 0"
scope: "atomic"
trigger: "pull-request"
---

The dependency check (scripts/boundaries.mjs) allows a part to import another only through its index (index.ts, the published API, imported as '@/lib/<part>'); an import of another part's file fails the check.

Threshold: 0 imports from one part into another part's files other than its index.ts

Tool: scripts/boundaries.mjs
