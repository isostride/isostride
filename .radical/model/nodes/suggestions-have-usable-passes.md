---
id: "9c5ba92a-70c2-4727-8cc9-65b817cf9377"
type: "scenario"
label: "Suggestions have usable passes"
gherkin: "And a segment passed many times whose passes fail the conditions is not proposed"
given: "the author's runs, with city route segments where most passes include a wait at the lights"
then: "every proposed route segment has at least 5 passes that meet its matching conditions, and its basis says how many"
when: "detection proposes block definitions"
---
