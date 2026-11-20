---
id: "18a5c677-7eb9-4ef2-8d2b-57004eba40d6"
type: "requirement"
label: "Map follows the zoom"
action: "zoom the route map to the stretch of the route run in that range, and show the whole route again when the whole run is shown"
ears_type: "event-driven"
rationale: "The runner asked: \"zoom sekcji powinien robic zoom na mapie\". The model's choices: the map takes the closest zoom of the map tiles at which the stretch fits, centred on it; the stretch in the range is drawn strong and the rest of the route faint; moving along the run moves the map with it."
trigger: "the runner zooms the chart of a run to a range of time"
---
