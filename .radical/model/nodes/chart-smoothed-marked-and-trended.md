---
id: "a3d655ff-98f9-4f76-a992-556ed91006c4"
type: "scenario"
label: "Chart smoothed, marked and trended"
given: "the Run screen of an imported run"
then: "Raw redraws the lines from the windows and Smooth from their rolling mean; the focused metric shows a dashed average line and its min and max as points lying on its line, with values; pointing at the Max of heart rate lights its point; the statistics of the selection show a Trend /10 min row and a Pa:HR chip in %"
when: "the runner switches the line from Smooth to Raw and back in Settings, Charts, selects a stretch, and points at the Max cell of heart rate in the statistics"
---
