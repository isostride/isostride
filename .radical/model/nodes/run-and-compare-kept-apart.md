---
id: "4d9acf84-0320-4492-b578-7cec7d6fd5a8"
type: "adr"
label: "Run and Compare kept apart"
consequences: "An unsaved segment lives only in its browser tab (a link to it opens nothing elsewhere); a route or profile is too large for the link, so it is kept there under a short code."
context: "The runner asked whether the Run screen, where a run is analysed, and Analysis should be one screen; they answer different questions on different time axes (the minutes of one run against the dates of many)."
date: "2026-11-22"
decision: "Two screens joined by their actions: Run analyses one run; Analysis is named Compare (/compare; /analysis leads there, and an old A/B link /compare?def=… opens A/B), for runs and segments compared over time, their efforts, A/B and the curves. From a run, Compare this run opens it in Compare, and Compare similar brings the efforts like a selection into Compare as unsaved segments (same route, same profile), on its Efforts tab, where any segment's efforts can be drawn by distance; from Compare, an effort's Similar does the same, a point opens its run with the effort selected, and ← Compare returns."
status: "accepted"
---
