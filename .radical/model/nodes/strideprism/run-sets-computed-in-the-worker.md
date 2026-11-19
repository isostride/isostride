---
id: "5ba5e99c-da08-4beb-bd36-da1fd533abce"
type: "adr"
label: "Run sets computed in the worker"
alternatives: |
  1. A separate Ask screen with the same controls (built first, merged at the runner's request): the same answer in two places.
  2. Free text read by a grammar of the app's own (built, dropped at the runner's request): questions in words, but a fixed set of shapes.
  3. Reading the run files on the main thread: simpler, but the screen freezes on a long history.
  4. A language model through an API: any wording, but a key, the network and a summary of the runs leaving the computer.
consequences: |
  • Every analysis of runs is one of the items of one screen; a link reproduces it.
  • The same set always gives the same series, so scenarios state the values word for word.
  • A new metric of a run is a new branch of pointOf in lib/ask; a new filter a new part of the spec.
  • Nothing changes for Data stays local: the fitness function on network requests covers the series job too.
context: "The runner wants to look at the runs of a period, filtered and by a statistic, beside blocks on the Analysis screen (\"ask to tak naprawde analysis\"), built from controls rather than typed. The app sends nothing over the network (Data stays local), each route has a 200 KB script budget, reading every run file on the main thread would freeze the screen, and the answers must be deterministic and testable."
date: "2026-11-19"
decision: "A run set (period, filters, statistic) is an item of Analysis kept in the link as a spec (from|to|stat|tag|shoes|title). Its series, one point per run for every metric chosen, including the fastest stretch of a length, are computed in the Processing Worker by a 'series' job in one pass over the set's run files (lib/ask), with progress, and abandoned when the items change; the Trend rule of blocks gives the fitted line and the verdict. The screen's picker counts the matching runs from the runs index as the controls change. A set can be kept as a block from criteria. No free text and no grammar: the runner's choice."
status: "accepted"
---
