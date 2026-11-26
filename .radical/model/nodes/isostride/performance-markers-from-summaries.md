---
id: "fd9bcfa1-488a-4dc5-aba2-90b8fc256149"
type: "adr"
label: "Performance markers from summaries"
alternatives: |
  1. Computing each view from the run files when it opens: exact for any window, but every opening reads every run.
  2. A Banister model fitted to performances (k1, k2, τ1, τ2): it would predict performance, but needs regular maximal efforts to fit; the markers over time are the data such a fit would need, so they come first.
  3. VO2max estimates from pace and heart rate: popular on watches, but rest on population formulas; critical speed is measured from the runner's own bests.
consequences: "The views open at once and follow the load model of Settings. The markers rely on maximal efforts: weeks without hard efforts of 2–20 min show lower values than the fitness they hide, which the tab says. The first context after this version reads every run file once to build the new summaries."
context: "The runner asked for what helps to judge performance beyond the form chart, to judge it later. The runs are hundreds of files; the Performance screen should open without reading them."
date: "2026-11-21"
decision: "Four views, each a tab of Performance, computed on the main thread from derived/load-summaries.json and the index of runs: fitness markers (critical speed and D′, critical power and W′ by the Monod–Scherrer fit, predictions by Riegel's law, from the best of each length of 2–20 min over the 90 days up to each Sunday); weekly load with Foster's monotony and strain (those of a week not over yet over the 7 days up to today) and the ramp rate of fitness (the first week's from the end of its first day); the intensity distribution in Seiler's three zones of the maximum heart rate (under 82 %, 82–87 %, above 87 %), with the zones of Settings week by week; the efficiency factor of each run, the easy ones those with a mean heart rate under 82 % of the maximum, and its Pa:HR decoupling past the first 10 minutes. The summary of a run gains its efficiency factor, decoupling and moving time (summary version 2), built once per run like the rest."
status: "accepted"
---
