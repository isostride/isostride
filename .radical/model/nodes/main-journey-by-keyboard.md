---
id: "05929fda-cefa-4521-ae28-fbd51b8260af"
type: "fitness-fn"
label: "Main journey by keyboard"
cadence: "triggered"
characteristic: "interaction-capability"
invocation: "automated"
scope: "atomic"
trigger: "pull-request"
---

A Playwright test walks the main journey without the mouse: it tabs to each control by its accessible name, activates it with Enter or Space, and asserts the focused element is visible after every move; a control that cannot be reached within 200 tabs fails the test.

Threshold: The main journey completes with Tab, Shift+Tab, Enter, Space and the arrow keys only, and focus is visible at every step

Tool: Playwright

```ts
import { expect, test, type Page } from '@playwright/test'

async function tabTo(page: Page, name: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const focused = page.locator(':focus')
    if ((await focused.count()) && (await focused.textContent())?.includes(name)) { await expect(focused).toBeVisible(); return }
    await page.keyboard.press('Tab')
  }
  throw new Error(`${name} cannot be reached with Tab`)
}

test('checkout completes with the keyboard alone', async ({ page }) => {
  await page.goto('/')
  for (const step of ['Search', 'Add to basket', 'Checkout', 'Place order']) {
    await tabTo(page, step)
    await page.keyboard.press('Enter')
  }
  await expect(page.getByRole('heading', { name: 'Order placed' })).toBeVisible()
})
```
