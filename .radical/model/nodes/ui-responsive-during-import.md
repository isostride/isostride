---
id: "3e50c847-c0a6-4c80-8354-9e28dafeb247"
type: "scenario"
label: "UI responsive during import"
gherkin: "And the Runs screen shows the import progress"
given: "fit/ holds 50 FIT files not yet imported"
then: "the Settings screen opens while the import continues in the background"
when: "the user starts the import and, while it runs, switches to the Settings screen"
---
