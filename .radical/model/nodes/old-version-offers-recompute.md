---
id: "ad22c80f-c82c-4d21-ad60-2e568333f3a4"
type: "scenario"
label: "Old version offers recompute"
gherkin: "But a folder whose manifest.json records version 3 opens without the offer"
given: "a data folder whose manifest.json records algorithm version 2"
then: "it offers the user to recompute"
when: "the application with algorithm version 3 opens it"
---
