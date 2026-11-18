---
id: "d355ae31-dde7-4956-9cbf-15c977f8d255"
type: "step"
label: "Detect Block Instances"
children: "sequence"
condition: "for each active Block Definition, in each new Run"
order: 5
repeat: "0..n"
---

Find candidate fragments, then run "Match a Block Instance" on each and store its four context layers.
