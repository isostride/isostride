---
id: "5d936220-729f-479c-8731-3e20a5b0bbb8"
type: "fitness-fn"
label: "No accessibility violations"
cadence: "triggered"
characteristic: "interaction-capability"
invocation: "automated"
metrics: "a11y.violations{impact=serious-or-critical} == 0"
scope: "atomic"
trigger: "pull-request"
---

A Playwright test (e2e/accessibility.spec.ts) opens each screen of the main journeys with real data, in the light and the dark theme, and runs axe-core with the WCAG 2.0, 2.1 and 2.2 A and AA tags; any serious or critical violation fails it.

Threshold: 0 serious or critical axe violations against the WCAG 2.0 and 2.1 A and AA rules and the 2.2 AA rules on every screen

Tool: axe-core with Playwright (@axe-core/playwright)
