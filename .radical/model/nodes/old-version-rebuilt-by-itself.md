---
id: "ad22c80f-c82c-4d21-ad60-2e568333f3a4"
type: "scenario"
label: "Old version rebuilt by itself"
gherkin: "But a folder whose manifest.json records the application's version opens without a recompute"
given: "a data folder of 3 runs whose manifest.json records an algorithm version older than the application's"
then: "it recomputes everything by itself and says “Rebuilt 3 runs for this version of the app.”; the manifest then records the application's version and no warning is shown"
when: "the application opens it"
---
