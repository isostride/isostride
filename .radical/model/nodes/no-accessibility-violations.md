---
id: "5d936220-729f-479c-8731-3e20a5b0bbb8"
type: "fitness-fn"
label: "No accessibility violations"
cadence: "triggered"
characteristic: "interaction-capability"
invocation: "automated"
scope: "atomic"
trigger: "pull-request"
---

A Playwright test opens each page of the main journeys, including open dialogs and error states, and runs axe-core with the WCAG A and AA tags; any serious or critical violation fails it.

Threshold: 0 serious or critical axe violations against the WCAG 2.0 and 2.1 A and AA rules and the 2.2 AA rules on every page of the main journeys

Tool: axe-core with Playwright (@axe-core/playwright)

```ts
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

for (const path of ['/', '/search', '/checkout']) {
  test(`${path} meets WCAG 2.2 AA`, async ({ page }) => {
    await page.goto(path)
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([])
  })
}
```
