---
id: "067d7856-f2fe-4f01-b1cf-760ef5527a91"
type: "adr"
label: "A block is a rule"
consequences: "One editor serves new, kept, suggested and run-made blocks; older files and suggestions find the same segments as before (the integration tests of blocks pass unchanged in what they find); the stored kinds stay readable but nothing writes them; a rule carrying a route or a profile is too large for the Analysis link, so such blocks are always kept."
context: "Blocks could be made in five ways (a suggestion, a rule in Analysis, four kinds from the chart menu, a lap layout, Find similar), each a kind of its own with its own detection; the runner asked for one model (\"ujedlici model\")."
date: "2026-11-22"
decision: "Every block definition is a rule (runs × stretch × conditions × how many per run × statistic) with matching tolerances; the kinds of block before it (route, structure, steady, effort, tag, pattern, profile) become stretches of a rule and are converted when read (asRule), and detection has one path, the rule's, delegating to the matchers each stretch needs (route passes, lap layouts, efforts, profiles)."
status: "accepted"
---
