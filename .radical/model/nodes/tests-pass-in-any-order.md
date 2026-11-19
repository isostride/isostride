---
id: "1a793ea3-d335-4fe1-aa57-feba437b067d"
type: "fitness-fn"
label: "Tests pass in any order"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
metrics: "tests.shuffled_runs.failed == 0"
scope: "atomic"
trigger: "nightly"
---

Vitest runs files and tests in random order on every run (sequence.shuffle) and prints the seed; the nightly run (npm run nightly) runs the suite three times with a different seed each time, and a failure prints the seed so the order can be reproduced.

Threshold: the suite passes in 3 consecutive runs with random order and parallel workers

Tool: Vitest (sequence.shuffle, --sequence.seed)
