---
id: "f23e5655-c7f1-4d0b-b3ab-37e6c42af5ba"
type: "fitness-fn"
label: "Interaction latency in lab"
cadence: "triggered"
characteristic: "performance-efficiency"
combine: "all"
invocation: "automated"
metrics: |
  e2e.inp.max <= 200 ms
  e2e.cls.max <= 0.1
  app.network.requests{origin=external} == 0
scope: "holistic"
trigger: "pull-request"
---

The Playwright end-to-end journeys (import, block-definition, trend, ab-comparison) run against the static export with the sample data folder in Chromium. The page loads the web-vitals library in test builds only and reports INP and CLS through a function the test exposes (page.exposeFunction), never over the network. After each journey the test asserts the values.

Threshold: per journey, INP within 200 ms and CLS at most 0.1; 0 measurements sent over the network

Tool: Playwright with web-vitals (test build only)

```ts
// e2e/vitals.ts
import { test, expect } from '@playwright/test'
test('trend filter change stays responsive', async ({ page }) => {
  const vitals: Record<string, number> = {}
  await page.exposeFunction('reportVital', (name: string, value: number) => { vitals[name] = value })
  await page.goto('/blocks/promenade/trend')
  await page.getByRole('button', { name: 'Pace' }).click()
  await page.getByRole('button', { name: 'Shoes A' }).click()
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))   // flushes INP
  expect(vitals.INP).toBeLessThanOrEqual(200)
  expect(vitals.CLS ?? 0).toBeLessThanOrEqual(0.1)
})
```
