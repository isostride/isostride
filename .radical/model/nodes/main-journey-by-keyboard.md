---
id: "05929fda-cefa-4521-ae28-fbd51b8260af"
type: "fitness-fn"
label: "Main journey by keyboard"
cadence: "triggered"
characteristic: "interaction-capability"
invocation: "automated"
metrics: "e2e.keyboard_journey.completed == 1"
scope: "atomic"
trigger: "pull-request"
---

A Playwright test (e2e/keyboard.spec.ts) walks the main journey without the mouse: import, accepting a block suggestion, the trend for pace and the A/B comparison. It tabs to each control by its accessible name, activates it with Enter or Space, and asserts the focused element is in view and draws a focus indicator after every move; a control that cannot be reached within 200 tabs fails the test.

Threshold: the main journey completes with Tab, Shift+Tab, Enter, Space and the arrow keys only, and focus is visible at every step

Tool: Playwright
