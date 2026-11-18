---
id: "d80d0ec6-3ee4-4a8d-b084-2724d2b1e34b"
type: "adr"
label: "Every violation fails the build"
alternatives: |
  1. A frozen baseline with a ratchet: adoptable today on an old codebase, at the cost of carrying known violations.
  2. Warnings only: visible, and ignored within weeks.
concern: "module-boundaries"
consequences: |
  • A violation never reaches main, so nobody comes to depend on one.
  • Switching the check on needs a clean codebase first; on an old one that is a project of its own.
  • A rule that turns out wrong blocks everyone until it is changed, which keeps the rules honest.
context: "The code in this element is cut into parts (modules, packages, libraries) and keeps changing. Without written and checked rules, every shortcut adds a dependency nobody decided on: one module reads another's internals, two packages import each other, and a \"common\" folder grows until every change touches everything. The forces: rules kept only in a wiki erode within months; a cycle makes two parts one, so neither can be tested, owned or released alone; sharing code saves typing but couples the teams that share it; a boundary nobody owns is crossed by whoever is in a hurry; and an old codebase cannot fix every violation at once. What the parts are (layers, rings, slices) is the Architecture style pack; who owns each part is the Code review and branching pack; this pack keeps the boundaries between the parts."
date: "2026-11-18"
decision: "The dependency check runs on every pull request as a job the main branch requires (the ruleset that protects main is the Code review and branching pack's), and any violation fails it: there is no baseline and no exception list. Existing violations, if any, are fixed before the check is switched on."
status: "accepted"
---
