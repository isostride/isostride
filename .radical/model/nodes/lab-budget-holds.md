---
id: "a6fde2be-ed0c-4697-a89e-fbb1224474c1"
type: "fitness-fn"
label: "Lab budget holds"
cadence: "triggered"
characteristic: "performance-efficiency"
combine: "all"
invocation: "automated"
metrics: |
  js.route.transfer.max <= 220 KB
  e2e.lcp.max <= 2500 ms
  e2e.cls.max <= 0.1
  e2e.tbt.max <= 200 ms
  a11y.violations{impact=serious-or-critical} == 0
scope: "atomic"
trigger: "pull-request"
---

Playwright opens every screen of the static export with the sample data folder in Chromium and measures LCP and CLS with the web-vitals library and Total Blocking Time (the lab stand-in for INP) from long tasks (e2e/vitals.spec.ts); the library is injected by the test only and reports through the page, never over the network. scripts/js-budget.mjs sums the gzip size of every script each screen's page loads from the export. axe-core checks every screen (e2e/accessibility.spec.ts). Lighthouse CI was the pack's tool; the local Playwright run measures the same budget (the author's decision of 19 Nov 2026: local only).

Threshold: for each screen: script transfer size at most 220 KB, LCP within 2500 ms, CLS at most 0.1, Total Blocking Time within 200 ms, 0 serious or critical accessibility violations

Tool: Playwright with web-vitals, scripts/js-budget.mjs, @axe-core/playwright
