---
id: "0a1697f1-3f2b-4e08-91aa-334b85d1e5d8"
type: "scenario"
label: "Flaky test leaves the gate"
given: "a test that fails and then passes on the same commit"
then: "the run fails until the test is in quarantine.json with an owner, and after 7 days it is fixed or deleted"
when: "the nightly run reports it as flaky"
---
