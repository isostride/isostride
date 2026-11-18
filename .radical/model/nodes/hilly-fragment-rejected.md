---
id: "c21bb240-ba44-4e8c-9e34-28b5722a4b13"
type: "scenario"
label: "Hilly fragment rejected"
gherkin: "And a fragment whose mean speed over the 2 minutes before differs by 20% from the block's speed is rejected with the reason \"effort before the block: 20%, limit 12%\""
given: "a steady-fragment Block Definition with pace 4:45–5:15/km and the default grade tolerance: effort pace differs from pace by at most 4%"
then: "the fragment is rejected with the reason \"grade: effort pace differs by 7%, limit 4%\""
when: "a fragment at 5:00/km has an effort pace 7% faster than its pace"
---
