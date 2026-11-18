---
id: "a5a56b28-2ba1-46be-8b29-9d87439949a9"
type: "fitness-fn"
label: "Unit tests stay isolated and few are end-to-end"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
scope: "atomic"
trigger: "pull-request"
---

The unit-test project disables network connections in its setup, so a unit test that reaches a server fails; a step in CI reads the JUnit reports, counts tests per suite and fails when the shares are off or a unit test took more than 100 ms.

Threshold: 0 unit tests reach the network or run over 100 ms; unit tests at least 70% and end-to-end tests at most 10% of all tests

Tool: Vitest with nock 14 or later (which intercepts native fetch too) and xmllint over the JUnit reports; for the JVM: JUnit 5 with a SecurityManager-free network block through a test ArchUnit rule and the same report arithmetic

```ts
// test/unit/setup.ts (vitest.config.ts: test.setupFiles of the unit project)
import nock from 'nock'
import { afterAll, beforeAll } from 'vitest'

beforeAll(() => nock.disableNetConnect())   // any real HTTP call throws
afterAll(() => nock.enableNetConnect())

// CI, from the JUnit reports reports/unit.xml, reports/integration.xml, reports/e2e.xml:
//   count() { xmllint --xpath 'string(sum(//testsuite/@tests))' "$1"; }
//   unit=$(count reports/unit.xml); e2e=$(count reports/e2e.xml); all=$((unit + $(count reports/integration.xml) + e2e))
//   [ $((unit * 100 / all)) -ge 70 ] && [ $((e2e * 100 / all)) -le 10 ]
//   [ "$(xmllint --xpath 'count(//testcase[@time > 0.1])' reports/unit.xml)" = 0 ]   # no unit test over 100 ms
```
