---
id: "e19e4f19-1db7-4d9c-bce0-0c85790643a5"
type: "scenario"
label: "Back link chosen from the trail"
given: "the screens visited in a browser tab: Runs, then Analysis with a tab and items in its link, then a run"
then: "it leads to the Analysis link as it was left, named Analysis, through the history when Analysis was the page right before; a later change of the Run screen's own link does not change it; with no screen visited before, it leads to Runs"
when: "the Run screen asks where its back link leads"
---
