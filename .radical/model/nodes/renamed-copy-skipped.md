---
id: "84930b78-0d43-4aea-b74b-808687a91b45"
type: "scenario"
label: "Renamed copy skipped"
gherkin: "And the number of Runs is unchanged"
given: "the Run starting 2026-11-14 07:02:11 is imported from \"run-1114.fit\""
then: "the copy is skipped because its start time equals an imported Run's"
when: "the user adds a copy named \"run-1114 (1).fit\" and imports the folder"
---
