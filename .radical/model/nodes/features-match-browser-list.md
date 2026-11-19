---
id: "292d4f8d-4b29-41e8-9af7-98a4a4d5115a"
type: "fitness-fn"
label: "Features match browser list"
cadence: "triggered"
characteristic: "compatibility"
invocation: "automated"
metrics: "compat.violations == 0"
scope: "atomic"
trigger: "pull-request"
---

The browser list lives in package.json ("browserslist": the last 2 versions of Chrome, Edge and Opera); eslint-plugin-compat (eslint.config.mjs) fails on a web API one of the listed browsers lacks, unless the build polyfills it (settings.polyfills). tests/integration/compat.test.ts lints the code and counts the violations; npm run check also runs ESLint. Playwright runs the journeys in Chromium (Chrome, Edge and Opera share its engine).

Threshold: 0 uses of web features missing from a browser on the list without a configured polyfill

Tool: browserslist with eslint-plugin-compat
