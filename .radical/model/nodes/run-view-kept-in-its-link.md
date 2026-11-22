---
id: "b216608f-bffe-457b-9a77-8a87ae614c9d"
type: "requirement"
label: "Run view kept in its link"
action: "keep the whole view in the run's link, so that reloading, going back to the run through the history or opening the link shows the same view; a run opened afresh, its link naming nothing but the run, starts clean, without the selection, zoom, scale shown or map from before, the metrics shown and the chart's settings the last chosen"
ears_type: "event-driven"
rationale: "The runner asked: \"chce miec persysnencej ustawein na poziomie runa ... w tym momencie resetuje sie wszystko, chce aby wszystko bylo endkodowane w url\". The model's choices: the link carries from/to (the range shown), m (the metrics in their colour slots), f (the metric whose scale shows), l (bands or overlay), x (time or distance), s (smooth or raw), b (blocks drawn) and map (the camera of a map moved by hand); a change replaces the link without a new history entry, a quarter of a second after the last change, as browsers limit how often a page may replace its address; each run remembers its last link in the browser, and a link's values win over the run's memory, which wins over the last choices made on any run; the chart menu, the pointer and the statistic pointed at are not part of the view. Then: \"przy otwarciu runa ... chce abys wyczyscil poprzednie parametry .. tzn selection itp\" (model's choice: what clears is what belongs to one look at the run, the selection, zoom, scale shown and map; the metrics shown and the chart's settings stay as preferences)."
trigger: "the runner changes the view of a run (the range shown, the metrics, the scale shown, the lines, the x axis, the smoothing, the blocks drawn or the map)"
---
