---
id: "eac14764-4083-489d-82f3-63493d94a4c2"
type: "scenario"
label: "Firefox gets message"
gherkin: "And it does not start: no folder picker and no screens are shown"
given: "the user opens the application in Firefox, which has no showDirectoryPicker"
then: "it shows a message that the browser is not supported"
when: "the application loads"
---
