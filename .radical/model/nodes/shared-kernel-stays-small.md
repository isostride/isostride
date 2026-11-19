---
id: "7d6b12f4-6f67-4179-bdba-18d135ea871c"
type: "fitness-fn"
label: "Shared kernel stays small"
cadence: "triggered"
characteristic: "maintainability"
combine: "all"
invocation: "automated"
metrics: |
  kernel.forbidden_imports == 0
  kernel.share <= 5 %
scope: "atomic"
trigger: "pull-request"
---

The dependency check (scripts/boundaries.mjs) keeps the kernel (lib/kernel: the run contracts and versions, module.json "kernel": true) free of the parts and of every package outside its allowlist (empty), and compares its non-blank lines with those of all parts.

Threshold: the shared kernel imports no part and no third-party package outside its allowlist, and holds at most 5% of the source lines

Tool: scripts/boundaries.mjs
