---
id: "5126b424-ff43-4f89-a418-179569e7e47d"
type: "adr"
label: "Fitted model and VO2max estimates"
alternatives: |
  1. A nonlinear optimiser over all five parameters: finds the same optimum with more code and less certainty; the grid with linear least squares is exact for the gains and fast enough.
  2. The fitness markers' critical speed as the performance: smooth by construction (a 90-day best), which hides the response the model is fitted to; VDOT and VO2max per run are offered instead, both named.
  3. A watch's own VO2max: not in the FIT files of every watch, and its method is not stated.
consequences: "The estimates disagree by design, which the tab shows; the heart rate estimate rests on the resting and maximum heart rate of the load model. The fit is as good as its performances: R² and the number of points are shown, and a fit with too few is not drawn. Everything is computed from the summaries; no run file is read."
context: "The runner asked for the two steps left aside by \"Performance markers from summaries\": Banister's model fitted to the runner's own results, and VO2max estimated from pace and heart rate. The data are the runs' summaries (moving time, mean heart rate, efficiency factor, bests of 2–20 min) and the daily loads of the chosen model."
date: "2026-11-21"
decision: "VO2max three ways, named: Daniels and Gilbert's VDOT (1979) from the predicted 5 km of each week's fitness markers; per run, the ACSM running equation on level ground (VO2 = 0.2·v + 3.5 ml/kg/min, v in m/min) divided by the run's fraction of the heart rate reserve (Swain 1997: %HRR ≈ %VO2R), for runs of 20 min and more at half the reserve or more; Uth's 15.3 × HRmax/HRrest (2004). Banister's model fitted on the main thread: the impulse sums of the daily loads for each pair of time constants on a grid (τ1 15–60 d, τ2 2–20 d, τ2 < τ1), p0, k1, k2 by ordinary least squares, the pair with the least squared error and positive gains kept; R² shown; the projection by running the fitted model forward with no load."
status: "accepted"
---
