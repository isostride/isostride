---
id: "e9118911-4a30-4e28-92b3-10b03ce2cbfc"
type: "requirement"
label: "Flaky tests quarantined"
action: "list it in quarantine.json with an owner and a ticket within 1 working day, where it runs but no longer fails the check, and fix or delete it within 7 days"
ears_type: "unwanted-behaviour"
rationale: "A flaky test left in the gate teaches everyone to rerun until green; one left in quarantine forever is a deleted test nobody decided to delete (Fowler, Eradicating Non-Determinism in Tests: quarantine). Local only for now (the author's decision of 19 Nov 2026, need \"Strideprism MVP specification\": \"Local only\"): the check of a change is npm run check before it is committed; there is no pull request or merge yet."
unwanted_condition: "a test fails and then passes on the same commit"
---
