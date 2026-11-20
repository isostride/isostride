---
id: "e1fb2839-eff8-4d39-a460-d51388a469d5"
type: "scenario"
label: "Rule in words and in the link"
given: "the rule \"the fastest 5 minutes with the heart rate never below 160, in runs tagged tempo since 1 March\", and a block from criteria kept by an older version"
then: "its name is \"Fastest 5 min · HR never below 160 · tempo · since 2026-03-01\", the link's code holds letters, digits, - and _ only and gives the same rule back, nonsense is no rule, the period presets count from today, and the older criteria block reads as the rule it was with the general conditions off"
when: "the rule is named, written into the link and read back, and the older file is read"
---
