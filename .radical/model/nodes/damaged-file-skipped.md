---
id: "c2d7666b-6bd3-41ce-a923-608cb0217869"
type: "scenario"
label: "Damaged file skipped"
gherkin: |
  And the Data folder screen lists the damaged file with the reason it could not be imported, and the Runs screen does not
  And on the next import the damaged file is tried again
given: "fit/ holds 3 FIT files, one of them damaged"
then: "the 2 readable files are imported as Runs"
when: "the user imports the folder"
---
