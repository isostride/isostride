---
id: "697a7cbb-6919-4961-a069-35f06b45d08d"
type: "requirement"
label: "Metrics on one chart"
action: "draw the metrics the runner chooses on the Run screen as lines on one chart with one time axis, each on a scale that makes it readable beside the others, show the scale of each line, and show the value of every line under the pointer"
ears_type: "ubiquitous"
rationale: "The runner asked: \"chce aby metryki byly nakladane na 1 wykres\", then: \"popracuj nad skala ... aby wyjkresy wyghladaly dobrze na jednym wykresie\", and later of how it looked: \"w kolekjnie rundzie zobacz na wykres biegu: tez troche odsstaje pod wzgledem iwzualnym\". The model's choices: each line is scaled to its own range, since metrics of different units have no common y scale and a second y axis misleads; by default each line has a lane of its own, 8 px from the next (they overlapped by a quarter, the lines running through each other), with two round values of its scale and its name, at least 62 px high on a phone (the chart grows past the height asked there), and a toggle \"Bands / Overlaid\" lays them over the whole height; a line's scale spans its values between the 5th and the 95th percentile in the time shown, padded; the focused metric (the first shown, or the one clicked in the legend) shows its grid and wash; up to 4 metrics at once, each keeping its colour while it is shown; laps, kept blocks and the selection stay drawn as bands inside the lanes."
---
