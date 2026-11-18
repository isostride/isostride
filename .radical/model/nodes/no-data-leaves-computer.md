---
id: "d7d1886c-0eda-4086-931c-fe3a0b2be1d9"
type: "fitness-fn"
label: "No data leaves computer"
cadence: "triggered"
characteristic: "security"
invocation: "automated"
metrics: "app.network.requests{origin=external} == 0"
scope: "holistic"
trigger: "pull-request"
---

Through a full import, recompute, trend, A/B and export journey the application makes no network request beyond loading its own static files: there is no server and the data never leaves the computer.
