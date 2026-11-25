---
id: "83720867-f025-4cd7-9162-1ea53afba93f"
type: "requirement"
label: "Efforts compared on one chart"
action: "draw the runs chosen above the chart (at most 4; at first the newest and the one before, or the run of the part compared from and the two newest others), each as one line, the mean of its efforts window by window from their start, on one chart as rich as the run's: the metrics chosen above the tabs, each in its band on one scale with the zones of Settings behind, along the distance or the time, smoothed or raw, with a cursor giving every line's values; and under it each line's time, distance, climb and the average, lowest and highest of each metric drawn; the chart alone, no table under it and no choice of metrics of its own"
ears_type: "event-driven"
rationale: "The runner asked: \"w sekcji efforts i wykresy - wygladaja ubogo ... maja byc tak rozbudowane jak w sekcji runs\"; later: \"jak wybiore pojawia sie diagram i mam tam znowu wybor metryk\", \"chce toogle ... tabela/wykres\", \"tryb wykres i tak wyswietla tabele tylko ponizej\", and asked how to choose what is drawn, \"Wybór biegów\". Model's choices: at most 4 runs at once and 2 at first; each run's efforts averaged over as many 10 s windows as its shortest has, its figures kept to a tenth; the part compared from in ink, the others in the colours of the series."
trigger: "the runner shows the Efforts tab of Compare as a chart"
---
