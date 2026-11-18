---
id: "1a793ea3-d335-4fe1-aa57-feba437b067d"
type: "fitness-fn"
label: "Tests pass in any order"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
scope: "atomic"
trigger: "nightly"
---

A nightly job runs the suite three times with shuffled order and a different seed each time; a failure prints the seed, so the order can be reproduced.

Threshold: The suite passes in 3 consecutive runs with random order and parallel workers

Tool: Vitest (sequence.shuffle); for the JVM: JUnit 5 with junit.jupiter.testmethod.order.default set to MethodOrderer$Random; for Python: pytest-randomly

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    sequence: { shuffle: true },  // files and tests in random order
    pool: 'threads',
  },
})
// nightly: for run in 1 2 3; do npx vitest run --sequence.seed=$RANDOM || exit 1; done
```
