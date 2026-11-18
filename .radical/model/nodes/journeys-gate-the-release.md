---
id: "b90202ab-2fcb-414f-83ca-2f368c7e56ed"
type: "fitness-fn"
label: "Journeys gate the release"
cadence: "triggered"
characteristic: "functional-suitability"
invocation: "automated"
scope: "holistic"
trigger: "pull-request"
---

Playwright runs the journeys against the environment the pipeline deployed (an ephemeral one per pull request, or staging after the merge) with no retries and no test.only; a CI step reads the JUnit report and fails on a skipped test. The job is a required check for the merge, or the gate of the promotion.

Threshold: All end-to-end tests pass before the build is merged or promoted, with 0 skipped

Tool: Playwright (junit reporter) with xmllint in a shell step; for the JVM: Playwright for Java with the same report

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: true,                       // no test.only left in the gate
  retries: 0,
  reporter: [['junit', { outputFile: 'reports/e2e.xml' }]],
  use: { baseURL: process.env.E2E_BASE_URL, trace: 'retain-on-failure' },
})
// CI, after npx playwright test:
//   [ "$(xmllint --xpath 'string(//testsuites/@skipped)' reports/e2e.xml)" = 0 ] || { echo "skipped end-to-end tests"; exit 1; }
```
