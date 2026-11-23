---
id: "f887a415-078c-4b2b-a508-463ef2387383"
type: "adr"
label: "Own statistics module"
alternatives: "An external statistics library."
consequences: "No external dependency; tested against hand-checked values."
context: "Comparisons need linear regression for pace correction and bootstrap uncertainty intervals."
date: "2026-11-18"
decision: "Write an own TypeScript module (lib/stats) instead of using a statistics library."
status: "accepted"
---
