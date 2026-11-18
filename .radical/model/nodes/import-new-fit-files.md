---
id: "2a0542b2-ead0-42d2-ad1c-24694dc2d613"
type: "scenario"
label: "Import new FIT files"
gherkin: "And the Runs screen lists the 3 Runs with their import status"
given: "fit/ holds 3 FIT files exported by hand from COROS and no Run has been imported"
then: "3 Runs exist, each with its Samples and Laps"
when: "the user imports the folder"
---
