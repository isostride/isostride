---
id: "714b331c-200a-490e-85f7-6a72d565f28a"
type: "fitness-fn"
label: "Quarantine is emptied"
cadence: "triggered"
characteristic: "maintainability"
combine: "all"
invocation: "automated"
metrics: |
  quarantine.overdue == 0
  quarantine.incomplete == 0
scope: "atomic"
trigger: "pull-request"
---

Quarantined tests are listed in quarantine.json (test, owner, ticket, since). A unit test over the list (tests/unit/quarantine.test.ts) fails when an entry is older than 7 days or has no owner or ticket.

Threshold: 0 tests in quarantine for more than 7 days; every entry has an owner and a ticket

Tool: Vitest (a test over quarantine.json)
