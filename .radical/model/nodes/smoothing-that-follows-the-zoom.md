---
id: "b8bef40a-5e12-4451-b5e3-c5dffc6de4d2"
type: "requirement"
label: "Smoothing that follows the zoom"
action: "draw each line as the rolling mean of its 10 s windows over a span that grows with the range shown, keeping the breaks at stops"
ears_type: "state-driven"
precondition: "the run chart is set to Smooth"
rationale: "The runner asked: \"jakiegos spline aby odszumic\", then: \"zrob 1,2 i 3\". The model's choices: a spline only joins points smoothly, a mean removes the noise; the span is 1/30 of the range shown, from 10 s (the windows as they are) up to 2 min; Smooth is the default and Raw / Smooth sits in the chart menu."
---
