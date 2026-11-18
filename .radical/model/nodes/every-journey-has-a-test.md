---
id: "9804e6b1-e27c-49d3-af34-bad27cca134c"
type: "fitness-fn"
label: "Every journey has a test"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
scope: "atomic"
trigger: "pull-request"
---

A test lists the journeys the decision names and expects a spec file e2e/<journey>.spec.ts for each (spaces in a journey's name become dashes); a journey without a spec fails the test, so the list and the suite cannot drift apart.

Threshold: 100% of the journeys import, block-definition, trend, ab-comparison have a Playwright spec under e2e

Tool: Vitest over the e2e directory; for the JVM: the same test with JUnit 5 over src/e2e

```ts
import { existsSync } from 'node:fs'
import { expect, it } from 'vitest'

const JOURNEYS = 'import, block-definition, trend, ab-comparison'.split(/,\s*/).map((j) => j.trim().toLowerCase().replace(/\s+/g, '-'))

it.each(JOURNEYS)('journey %s has an end-to-end spec', (journey) => {
  expect(existsSync(`e2e/${journey}.spec.ts`), `e2e/${journey}.spec.ts is missing`).toBe(true)
})
```
