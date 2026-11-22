---
id: "83720867-f025-4cd7-9162-1ea53afba93f"
type: "requirement"
label: "Efforts compared on one chart"
action: "draw them on one chart as rich as the run's: the metrics chosen (pace, heart rate, cadence and the others the run chart offers, with the elevation), each in its band on one scale for every effort with the zones of Settings behind, along the distance or the time from each effort's start, smoothed or raw, with a cursor giving every effort's values; and under it each effort's time, distance, climb and the average, lowest and highest of each metric drawn"
ears_type: "event-driven"
rationale: "The runner asked: \"w sekcji efforts i wykresy - wygladaja ubogo ... maja byc tak rozbudowane jak w sekcji runs\". Model's choices: pace, heart rate and cadence drawn first; each effort's 10 s windows read in the Processing Worker; smoothing over a window and two either side (about 50 s); the selection compared from first, in ink, the others in the colours of the series; at most 4 efforts at once."
trigger: "the runner ticks efforts on the Efforts tab of Compare"
---
