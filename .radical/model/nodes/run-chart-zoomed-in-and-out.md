---
id: "4f2b65d3-15c8-4d6c-8aaa-a4e875577a01"
type: "scenario"
label: "Run chart zoomed in and out"
given: "the Run screen of an imported run with a stretch selected"
then: "the selection becomes exactly the range shown; a notch out doubles the range shown around the pointer and a notch in halves it back, the overview's window growing and shrinking with it, and the statistics are those of the range shown, titled Selection; a small notch zooms too, and so does the wheel over the overview; dragging the overview's window moves the range, its length kept; dragging elsewhere on the overview sets a new range; closing the selection shows the whole run; there are no zoom or whole-run buttons; the readout names the range shown"
when: "the runner selects a stretch, turns the mouse wheel out by one notch and in by one, then by a small notch and over the overview, drags the window of the overview strip, drags elsewhere on it, and presses Clear selection at the top right of the chart"
---
