---
id: "3d858429-f454-438e-a431-eed8e4172c06"
type: "scenario"
label: "Run file is columnar"
gherkin: "And its size is within about 100–300 KB"
given: "an imported sample Run"
then: "it is columnar JSON: one array per field, of equal length"
when: "its derived file runs/<id>.json is read"
---
