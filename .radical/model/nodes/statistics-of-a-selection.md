---
id: "0c6f59f6-0504-43e2-bd69-0eedb42ce04c"
type: "requirement"
label: "Statistics of a selection"
action: "show the min, max and avg of each metric shown on the chart in the selected stretch, with the stretch's time and distance, without covering them, and tell the selection only there"
ears_type: "event-driven"
rationale: "The runner asked: \"po zaznaczeniu pokazuje mi statystyki metryk w danym zaznaczeniu - min, max, avg\", then: \"statystyki odcinka pokazuja tylko wybrane metryki a nie wszystkie\", \"popup selected przeslania metryki\", \"iformacje o selected mam 3 miejscach w tym momencie ma byc tylko nadole w widget selection\" and \"tak zmerguj\" (the selection merged with the range shown). The model's choices: the selection is the range the chart shows, however it was set (a drag, the wheel, the map, the overview, a lap, a block); one row per metric shown, the columns min, avg, max (then: \"chce inny uklad metryk wiersz to metryka a nie kolumna\"); the stretch's time and distance beside the statistics; the selection is told only there, once (its clock range, time, distance and ✕); the statistics are taken over the 10 s windows with movement (stops left out), as the statistic of a block is; the average pace comes from the mean speed; with nothing selected the table shows the whole run."
trigger: "the runner selects a stretch of a run on its chart or map"
---
