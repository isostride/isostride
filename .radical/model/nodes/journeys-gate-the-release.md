---
id: "b90202ab-2fcb-414f-83ca-2f368c7e56ed"
type: "fitness-fn"
label: "Journeys gate the release"
cadence: "triggered"
characteristic: "functional-suitability"
combine: "all"
invocation: "automated"
metrics: |
  e2e.failed == 0
  e2e.skipped == 0
scope: "holistic"
trigger: "pull-request"
---

Playwright runs the journeys against the static export served by a plain static file server (scripts/static-server.mjs), with no retries and forbidOnly; scripts/test-metrics.mjs reads the Playwright report and records failed and skipped tests, and npm run check exits non-zero on either. Local only for now (the author's decision of 19 Nov 2026): there is no merge; a change is committed after npm run check passes.

Threshold: all end-to-end tests pass before a change is committed, with 0 skipped

Tool: Playwright (JSON report) with scripts/test-metrics.mjs
