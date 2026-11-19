---
id: "668193e6-22d8-49d5-a71f-1bda90dcf4d6"
type: "fitness-fn"
label: "Framework still supported"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
metrics: "framework.near_eol == 0"
scope: "atomic"
trigger: "nightly"
---

scripts/framework-support.mjs looks up each product and cycle listed in versions.txt (nextjs, react, nodejs for the build) on endoflife.date and fails when end of support is less than 180 days away, naming the version and its date; versions.txt changes together with package.json. npm run check and the nightly run both run it; only product names and cycles are sent to endoflife.date.

Threshold: 0 framework or build-tool majors within 180 days of their end of support

Tool: endoflife.date API (scripts/framework-support.mjs)
