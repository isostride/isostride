---
id: "5fec73e1-f20a-41e5-bf2b-b5a58bf77bac"
type: "need"
label: "Changes are released with confidence"
kind: "brief"
source: "Hub concern pack: Test strategy"
---

The element changes often, and every change must be releasable without fear: the tests have to catch a broken rule, a broken integration and a broken journey before users do, give that answer quickly enough that people wait for it, and give the same answer every time they run on the same code. A green build must mean something. The checks below share one layout: unit tests under test/unit, integration tests under test/integration, end-to-end journeys as Playwright specs under e2e/<journey>.spec.ts, JUnit reports written to reports/<suite>.xml, quarantined tests listed in quarantine.json.
