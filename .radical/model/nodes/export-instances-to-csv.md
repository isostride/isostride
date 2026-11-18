---
id: "c8488111-9e77-4da6-8d46-aac74fe4f0a4"
type: "scenario"
label: "Export instances to CSV"
gherkin: "And a CSV file holds the result: difference, uncertainty interval and verdict"
given: "the A/B Comparison split by shoes"
then: "a CSV file holds one row per Block Instance with its context fields and metric means"
when: "the user exports its instances and its result"
---
