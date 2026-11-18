---
id: "342343ef-917c-4171-99f8-14183dcb563e"
type: "scenario"
label: "Rejected stays rejected"
gherkin: "And after \"Recompute everything\" it is still not proposed"
given: "the user rejected the recommended route segment Block Definition for the promenade southbound"
then: "the promenade southbound is not proposed again"
when: "the user imports 5 new Runs that pass the promenade southbound and detection runs"
---
