---
id: "058838f5-1eff-4381-9e09-dd4cd1504ae1"
type: "scenario"
label: "Register shoes"
gherkin: "And it is saved in user/gear.json"
given: "the Gear register is empty"
then: "\"Shoes A\" appears in the register with its type and date range"
when: "the user adds Gear \"Shoes A\" of type shoes used from 2026-08-03 to 2026-10-31"
---
