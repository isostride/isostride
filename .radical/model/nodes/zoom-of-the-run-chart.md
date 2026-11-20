---
id: "8cd8c786-c600-4808-95b3-d73aac37d4b1"
type: "requirement"
label: "Zoom of the run chart"
action: "make that stretch the range the chart shows, exactly, with each line rescaled to its values in it, the same range being the selection the statistics, marks and blocks work on, show it as the window of the overview strip, and go back to the whole run when the selection is closed"
ears_type: "event-driven"
rationale: "The runner asked: \"moge zrobic zoom in wykresu i zoom aut\", then: \"zaznaczenie automatycznie zoomuje, teraz musze to kliknac\", \"zmiana okna na dole w podgladzie lub zaznaczenie tam zmienia selekcje\", \"zoom powinien automatycznie zwiekszac i zmniejszac okno na dole podgladu\", \"usun przycisk whole run ... zamknieci selelckji na dole wraca do calego treningu\", \"zoom myszka nie dziala\" and, asked whether to merge the selection and the range, \"tak zmerguj\". The model's choices: one notion, the range shown, set exactly by a drag on the chart, the mouse wheel (around the point under the pointer, by a factor growing with the square root of the wheel's delta: a notch of 4 px about 15 %, one of 100 px twice), a pinch, the map, the overview strip (dragging its window moves the range, dragging elsewhere sets a new one), a lap's bar, a block, the laps table or a link; the least range is 20 s, two windows; no zoom buttons; the ✕ of the statistics shows the whole run, as do the key 0 on the focused chart and the wheel out."
trigger: "the runner zooms the chart of a run, selects a stretch of it, or moves along it"
---
