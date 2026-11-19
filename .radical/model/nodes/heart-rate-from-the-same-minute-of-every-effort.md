---
id: "3cd8560b-fa73-4d5d-8ff2-70be65c42c06"
type: "scenario"
label: "Heart rate from the same minute of every effort"
gherkin: |
  And a block without the attribute has heart rate over the whole block, wherever it starts in the run
  And the block's card shows "heart rate from minute 5"
given: "the \"30-minute effort\" block with its heart rate start at minute 5, and efforts starting at minute 3 and at minute 13 of their runs"
then: "both have heart rate, each the mean from minute 5 of the effort to its end (25 minutes), whatever minute of the run the effort started"
when: "the instances are matched"
---
