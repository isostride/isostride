---
id: "50a052f7-595b-411c-a59a-5d8b6247b9ff"
type: "scenario"
label: "Shoe override for one run"
gherkin: "And the other Runs of that period still use \"Shoes A\""
given: "a Run of 2026-09-10 assigned \"Shoes A\" by date"
then: "the Run uses \"Shoes B\""
when: "the user sets the shoe override of its Run Tag to \"Shoes B\""
---
