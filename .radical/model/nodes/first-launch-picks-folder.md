---
id: "26649d2f-ac65-4841-bce8-8b156e16b6fe"
type: "scenario"
label: "First launch picks folder"
gherkin: "And after the user picks \"my-folder\" its handle is remembered in IndexedDB"
given: "the application has never been opened in this Chrome profile"
then: "the application asks the user to pick the data folder"
when: "the user opens the application"
---
