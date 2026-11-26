---
id: "bee402da-679f-49a5-9d2a-c2387657f4f3"
type: "scenario"
label: "CSV cells not run"
given: "names beginning with =, @ and + that are no numbers, negative numbers, a text with a comma and one with a line end"
then: "the names get an apostrophe before them (and quotes where they hold a quote or a comma); the numbers stay as they are; the comma and the line end are quoted"
when: "they are written as cells of a CSV export"
---
