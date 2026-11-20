---
id: "2a71cd65-f7bf-43c0-ad49-7b8a514047f3"
type: "requirement"
label: "Map zoomed and panned"
action: "zoom or move the map and show across the whole chart the stretch of the route seen on the map"
ears_type: "event-driven"
rationale: "The runner asked: \"dodaj operacje na mapie ... zoom przesuwanie mapy automatycznie synchronizuje wykres\", then: \"fragment trasy na mapie powinien byc pokazywany w calosci na pelnym ekranie wykresu\". The model's choices: the mouse wheel zooms around the point under the pointer in fine steps (the tiles scaled between their levels), as the chart's wheel does, each wheel event going on from the last camera; the map zooms in no further than the chart can follow, while the stretch in view is run in 1 minute or more (the chart's least range, its windows being 10 s); dragging pans, and a stretch under a minute reached so sits in the middle of the chart's minute; a click without a drag still picks the ends of a stretch; the stretch shown is the part of the route in view run in one go (on a loop or an out-and-back several parts can be in view): the one under the pointer when zooming, the one nearest the centre of the map when dragging; it is trimmed of the standing at its ends (slower than 0.8 m/s), so the running fills the chart from its start to its end, while a stop inside it keeps its time on a time axis; with the whole route in view the chart shows the whole run; zooming or selecting on the chart still fits the map, while a map moved by hand is not snapped back."
trigger: "the runner zooms or pans the route map of a run"
---
