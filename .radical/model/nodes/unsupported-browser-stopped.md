---
id: "6f9ae10d-bb61-43c7-b0d8-c0b4996e419f"
type: "fitness-fn"
label: "Unsupported browser stopped"
cadence: "triggered"
characteristic: "compatibility"
combine: "all"
invocation: "automated"
metrics: |
  e2e.unsupported_browser.started{browser=firefox} == 0
  e2e.unsupported_browser.started{browser=webkit} == 0
  e2e.supported_browser.started{browser=chromium} == 1
scope: "holistic"
trigger: "pull-request"
---

Opened in Firefox or Safari (no showDirectoryPicker), the application shows the not-supported message and does not start; in Chrome and Edge it starts.
