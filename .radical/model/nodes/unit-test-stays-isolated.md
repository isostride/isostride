---
id: "51b1e1de-1354-4042-b149-db1af504cf02"
type: "scenario"
label: "Unit test stays isolated"
combine: "all"
given: "the unit test suite with network access blocked"
metrics: |
  tests.unit.network_calls == 0
  tests.unit.over_100ms == 0
  tests.unit.share >= 40 %
  tests.e2e.share <= 15 %
then: "a test that reaches the network fails, every unit test runs in under 100 ms, unit tests are at least 40% of all tests and end-to-end tests at most 15%"
when: "it runs"
---
