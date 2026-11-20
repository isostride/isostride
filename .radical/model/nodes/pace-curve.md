---
id: "e84ad3f8-43b0-4d2e-a541-5f69d06f66ac"
type: "requirement"
label: "Pace curve"
action: "draw, for each item, one line of the fastest stretch of each length of time inside the item's segments (a block's segments, a single run whole), time on the x axis and pace on the y axis, each point naming the run and the minutes it comes from"
ears_type: "event-driven"
rationale: "The runner asked: \"chce miec mozliwosc zbduowanej kryzwej predkosci .. tzn os x czas, os y - tempo, i taki wykres powinien byc tworzony ze wszystkich problem\" (every attempt), and then that the app uses the segments it selected: \"system wybiera mi wszystkie segmenty i je uzywa\" — so the curve is drawn from the item's segments. The lengths, 30 s to 2 h in 13 steps on a logarithmic axis, and the curve as a switch of the Analysis screen kept in the link, are the model's choices."
trigger: "the user switches the pace curve on in Analysis"
---
