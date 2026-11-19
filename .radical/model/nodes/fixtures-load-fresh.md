---
id: "7f1ed88b-3fc4-44f4-9700-7b2a6be24e6c"
type: "scenario"
label: "Fixtures load fresh"
given: "the synthetic FIT fixtures and their expected values under tests/fixtures"
then: "they are copied into a fresh temporary data folder, load without error and match their expected values, and the suite passes in random order"
when: "a test run starts"
---
