---
id: "e2fddc4a-181d-426e-ac56-3fec9f7fd88f"
type: "fitness-fn"
label: "No screen wider than a phone"
cadence: "triggered"
characteristic: "interaction-capability"
combine: "all"
invocation: "automated"
metrics: "layout.phone.screens_wider_than_screen == 0"
scope: "holistic"
trigger: "pull-request"
---

On a phone no screen of the app scrolls sideways: the page is never wider than the device (ADR "Look and feel"). Measured by the end-to-end test "Screens fit a phone", which goes through every screen, tab and view on an emulated Pixel 7 and counts those wider than the screen.
