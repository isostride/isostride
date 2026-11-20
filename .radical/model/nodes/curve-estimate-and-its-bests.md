---
id: "a16730bb-1a33-42d0-aa2a-cbba367474ec"
type: "requirement"
label: "Curve estimate and its bests"
action: "draw the estimated curve with each item's line, show the estimate's parameters for each item (for speed the exponent, critical speed, D′ and predicted race times; for power the exponent, critical power, W′ and the estimated power at 5, 20 and 60 minutes), and list the curve's bests, each with the run and the stretch it comes from and a link that opens that run with the stretch selected"
ears_type: "event-driven"
rationale: "The runner asked: \"to krzywych dodaj estymowana krzywa i parametry ... oraz mozliwosc skokow do odbpowiednij segmentow biegow z ktorych ta krzywa powsytala\" — the estimated curve and its parameters, and a way to jump to the segments of the runs the curve comes from. Model's choices: the parameters as tiles per item, the bests as a table (length, best, estimate, gap, run, stretch, Open run →), the pointer over a row ringing its point on the chart, the 5/20/60 minute powers, and a best stretch allowed to end on the segment's last sample so a 10-minute segment gives a 10-minute best."
trigger: "the user opens the Pace / power curve tab"
---
