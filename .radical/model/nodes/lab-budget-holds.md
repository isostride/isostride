---
id: "a6fde2be-ed0c-4697-a89e-fbb1224474c1"
type: "fitness-fn"
label: "Lab budget holds"
cadence: "triggered"
characteristic: "performance-efficiency"
invocation: "automated"
scope: "atomic"
trigger: "pull-request"
---

Lighthouse CI serves the static export (out/) and runs three times per screen on its desktop profile and asserts the budget; the median run counts. The script size is the transfer size of every script the page loads. The test build opens the sample data folder from tests/fixtures (a puppeteerScript picks it before the runs), so the screens show real runs. INP needs real interactions, so it is checked in the Playwright journeys (see Interaction latency in lab). Reports stay on the CI filesystem; nothing is uploaded.

Threshold: On every pull request, for each screen: script transfer size at most 200 KB, LCP within 2500 ms, CLS at most 0.1, Total Blocking Time within 200 ms (the lab stand-in for INP), accessibility score at least 0.95

Tool: Lighthouse CI

```js
// lighthouserc.cjs
module.exports = {
  ci: {
    collect: {
      staticDistDir: './out',
      url: ['/runs', '/runs/sample', '/blocks', '/blocks/sample/trend', '/blocks/sample/compare', '/gear'],
      numberOfRuns: 3,
      settings: { preset: 'desktop' },
      puppeteerScript: './tests/lighthouse-open-fixtures.cjs',   // opens the sample data folder
    },
    assert: {
      assertions: {
        'resource-summary:script:size': ['error', { maxNumericValue: 200 * 1024, aggregationMethod: 'median' }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500, aggregationMethod: 'median' }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1, aggregationMethod: 'median' }],
        'total-blocking-time': ['error', { maxNumericValue: 200, aggregationMethod: 'median' }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
      },
    },
    upload: { target: 'filesystem', outputDir: './.lighthouseci' },
  },
}
```
