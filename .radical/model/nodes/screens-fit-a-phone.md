---
id: "9c9a3c37-246a-4fc6-8c44-32d267325a51"
type: "scenario"
label: "Screens fit a phone"
given: "40 runs imported in the setup wizard, on a phone (a Pixel 7: 412 px wide, a touch screen)"
then: "no screen is wider than the phone, and no card or dialog holds content wider than itself outside a row made to scroll; the screens are a tab bar at the very bottom, each tab 44 px high or more, under a top bar of at most 60 px; buttons are 40 px high or more; a calendar week is seven days in one line with its name over them and its totals under them, the filter one line; a field's name of a segment's rule is over its choices; every card of the map of the models is the map's width; the theme changes from the display options, which close on a tap beside them; the picker takes the screen over the bars; no serious accessibility violation in either theme"
when: "the runner goes through Runs (calendar and list), a run with its chart, Segments with a new segment's rule, the tabs of Analysis with the picker, the Performance overview and every view of Performance with a Why? open, and the tabs of Settings, and switches to the dark theme from the top bar"
---
