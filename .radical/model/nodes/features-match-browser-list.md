---
id: "292d4f8d-4b29-41e8-9af7-98a4a4d5115a"
type: "fitness-fn"
label: "Features match browser list"
cadence: "triggered"
characteristic: "compatibility"
invocation: "automated"
scope: "atomic"
trigger: "pull-request"
---

The browser list lives in package.json and drives the build's transpilation; eslint-plugin-compat fails on a web API one of the listed browsers lacks. Playwright runs the journeys in Chromium (Chrome, Edge and Opera share its engine).

Threshold: 0 uses of web features missing from a browser on the list without a configured polyfill

Tool: browserslist with eslint-plugin-compat

```js
// package.json: "browserslist": ["last 2 Chrome versions", "last 2 Edge versions", "last 2 Opera versions"]
// eslint.config.mjs
import compat from 'eslint-plugin-compat'
export default [
  compat.configs['flat/recommended'],
  { settings: { polyfills: [] } },   // what the build polyfills
]
```
