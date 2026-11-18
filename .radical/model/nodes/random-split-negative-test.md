---
id: "acc7080d-81b9-4b31-8f5c-db0d35e36abb"
type: "fitness-fn"
label: "Random split negative test"
cadence: "triggered"
characteristic: "functional-suitability"
invocation: "automated"
metrics: "ab.random_split.no_change_trials{trials=10} >= 9"
scope: "holistic"
trigger: "pull-request"
---

An A/B comparison on a random split of runs returns “no detectable change” in at least 9 of 10 trials: the verdict rule does not see changes in noise. Acceptance criterion 5.
