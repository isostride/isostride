---
id: "cb1a6603-6ea5-471a-81f0-3170190745b2"
type: "fitness-fn"
label: "Screens say segment and effort"
cadence: "triggered"
characteristic: "interaction-capability"
invocation: "automated"
metrics: "ui.block_words == 0"
scope: "atomic"
trigger: "pull-request"
---

No screen shows "block" or "stretch": the text between tags and the labels, titles and placeholders of app/ and components/ are scanned; the code keeps its names.

Threshold: 0 visible texts with block or stretch

Tool: tests/unit/wording.test.ts
