---
id: "66ea8d17-0186-448e-b9d1-0a9a26f5e3af"
type: "adr"
label: "A small shared kernel"
alternatives: |
  1. Versioned internal libraries: each part upgrades on its own schedule.
  2. Nothing shared: no coupling through code, at the cost of duplication.
  3. A free-for-all "common" folder: easy, and it couples everything to everything.
concern: "module-boundaries"
consequences: |
  • Parts speak the same language about the few concepts they share.
  • Every kernel change is a change to every part that uses it, hence the approvals and the size limit.
  • Helpers that are convenient but not shared concepts stay in the parts and are sometimes duplicated.
context: "The code in this element is cut into parts (modules, packages, libraries) and keeps changing. Without written and checked rules, every shortcut adds a dependency nobody decided on: one module reads another's internals, two packages import each other, and a \"common\" folder grows until every change touches everything. The forces: rules kept only in a wiki erode within months; a cycle makes two parts one, so neither can be tested, owned or released alone; sharing code saves typing but couples the teams that share it; a boundary nobody owns is crossed by whoever is in a hurry; and an old codebase cannot fix every violation at once. What the parts are (layers, rings, slices) is the Architecture style pack; who owns each part is the Code review and branching pack; this pack keeps the boundaries between the parts."
date: "2026-11-18"
decision: "Code shared between parts lives in one shared kernel, lib/kernel: the run contracts (samples, laps, windows, run and index files) and the format versions used by at least two parts, types and constants only, with no dependency on a part and no package (an empty allowlist), at most 5% of the source lines. A change to the kernel is a change to every part that uses it and is reviewed as such."
status: "accepted"
---
