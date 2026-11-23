---
id: "f23e5655-c7f1-4d0b-b3ab-37e6c42af5ba"
type: "fitness-fn"
label: "Interaction latency in lab"
cadence: "triggered"
characteristic: "performance-efficiency"
combine: "all"
invocation: "automated"
metrics: |
  e2e.inp.max <= 200 ms
  e2e.cls.max == 0
  app.network.requests{origin=external} == 0
scope: "holistic"
trigger: "pull-request"
---

The Playwright run measures INP during the journeys' interactions (the trend's metric and correction, the A/B metric, and on the run chart a metric turned off and on, the scale of another, a lap selected and zoomed to, the selection closed) and CLS on every screen, against the static export with the sample data folder in Chromium (e2e/vitals.spec.ts). The web-vitals library is injected by the test only and reports through the page, never over the network.

Threshold: per journey, INP within 200 ms and no layout shift (CLS 0); 0 measurements sent over the network

Tool: Playwright with web-vitals (injected by the test only)
