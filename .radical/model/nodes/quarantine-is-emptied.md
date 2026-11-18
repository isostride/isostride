---
id: "714b331c-200a-490e-85f7-6a72d565f28a"
type: "fitness-fn"
label: "Quarantine is emptied"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
scope: "atomic"
trigger: "pull-request"
---

Quarantined tests are listed in quarantine.json and tagged @quarantine, which the gate skips and a separate non-blocking job runs. A test over the list fails the build when an entry is older than the deadline or has no owner or ticket.

Threshold: 0 tests in quarantine for more than 7 days; every entry has an owner and a ticket

Tool: Vitest (a test over quarantine.json); for the JVM: the same test with JUnit 5 over the file

```ts
import { expect, it } from 'vitest'
import quarantine from '../quarantine.json'   // [{ "test": "...", "owner": "...", "ticket": "...", "since": "2026-10-01" }]

const MAX_DAYS = 7

it('no test stays in quarantine past the deadline', () => {
  const overdue = quarantine.filter((q) =>
    !q.owner || !q.ticket || (Date.now() - Date.parse(q.since)) / 86_400_000 > MAX_DAYS)
  expect(overdue).toEqual([])
})
```
