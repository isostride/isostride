---
id: "6571fdbf-e3a5-4871-8aec-2f04b8ff4a85"
type: "adr"
label: "Declared dependencies only"
alternatives: |
  1. Levels: one rule for many parts, but less precise between peers.
  2. Only forbidding known-bad dependencies: easy to start, but anything not foreseen is allowed.
  3. No checked rules: fastest to start, and boundaries erode within months.
concern: "module-boundaries"
consequences: |
  • Every dependency between parts is a visible decision, reviewed when it is added.
  • The declarations are code to maintain: adding a dependency means changing one line in module.json and convincing a reviewer.
  • Boundaries hold only while the check runs in every build.
  • With many parts the lists become noise; levels scale better.
context: "The code in this element is cut into parts (modules, packages, libraries) and keeps changing. Without written and checked rules, every shortcut adds a dependency nobody decided on: one module reads another's internals, two packages import each other, and a \"common\" folder grows until every change touches everything. The forces: rules kept only in a wiki erode within months; a cycle makes two parts one, so neither can be tested, owned or released alone; sharing code saves typing but couples the teams that share it; a boundary nobody owns is crossed by whoever is in a hurry; and an old codebase cannot fix every violation at once. What the parts are (layers, rings, slices) is the Architecture style pack; who owns each part is the Code review and branching pack; this pack keeps the boundaries between the parts."
date: "2026-11-18"
decision: "Each part (a folder of lib/, and app, components and workers) declares in its module.json the parts it may depend on (\"uses\") and whether it runs on the main thread, in the Processing Worker or both, and exposes a published API in its index.ts; any other dependency, any import of another part's file but its index, any cycle through more than one part, and any main-thread import at run time of a part that runs in the worker fails the dependency check, which runs in every check of a change (every violation fails the build). Shared code: a small shared kernel. The checker is scripts/boundaries.mjs, which reads the module.json files; it runs in the unit tests, so a violation shows up like any failing test."
status: "accepted"
---
