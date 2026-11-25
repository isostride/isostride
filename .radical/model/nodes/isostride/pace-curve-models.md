---
id: "27bfbb75-0d7b-42a4-abeb-12bbcbb68e50"
type: "adr"
label: "Pace curve models"
alternatives: |
  1. A regression line through the bests (built first): describes the typical level, but leaves the strongest bests above the estimate and lets easy long runs pull the predictions down.
  2. The regression slope with its level raised to the strongest best (19 Nov to 25 Nov 2026): no best above the line, but the slope still from easy runs and the critical model still ordinary least squares, so a 3-minute best lay above its hyperbola.
  3. The critical speed model alone, drawn over the axis: predicts the critical speed held forever, so it overstates every effort beyond about 20 minutes.
  4. A fixed Riegel exponent of 1.06 through the single best stretch: no fit needed, but the runner's own endurance is what the curve should show.
consequences: |
  • The curve is the potential the bests imply, not the typical level; no best lies above it (within 0.1 %).
  • The critical speed and power move with the fit, so the rTSS and Power TSS loads are recomputed once (load summaries version 5).
  • Péronnet–Thibault with its fixed time constants may lie a few seconds per km above the bests of 5–15 minutes when it rests on 3 and 30 minutes: a limit of the model's shape, told by the note's gap.
  • Predicted times follow the envelope: fair for 5 km to the marathon from a strong 10 km, optimistic for the marathon without hard long runs.
context: "The runner wants an estimated pace curve \"bazujac na researchu\" beside the measured one (the fastest stretch of each length across the runs). The curve must be computed from a few best efforts of uneven quality (an easy long run is the only effort of its length), on the computer, deterministically."
date: "2026-11-19"
decision: "Models from the literature, fitted to the item's own best stretches, all by one method: least squares with an asymmetric error (envelope.ts) — a best above the curve costs 1000 times more than one as far below it, and one more than about 3 % below stops pulling (Welsch's loss), so the curve rests on the strongest bests and an easy run does not pull it down; every parameter comes from the fit, none is lifted after it (the runner's \"idz ta metoda\", 25 Nov 2026, replacing the regression slope raised to the strongest best of 19 Nov). The fit starts from the ordinary least squares and narrows the reach by steps (graduated non-convexity) to avoid a curve resting on three bests far above the rest. (1) Riegel's power law (Riegel 1981): speed ∝ time^(−k), fitted to the bests of 3 minutes and more; it gives the predicted times of 5 km, 10 km, the half and the marathon and is drawn past 20 minutes dotted, as an extrapolation. (2) The critical speed (power) model (Monod & Scherrer 1965; Hill 1993; Jones & Vanhatalo 2017): v = CS + D′/t fitted to the bests of 2–20 minutes and drawn as that hyperbola there. Under 2 minutes neither model holds: no gap is measured or shaded there, the bests stay drawn with a note. (3) Chosen by the runner in place of (1) and (2): the whole curve, Péronnet & Thibault (1989) for pace (speed in place of power, k1 = 30 s, k2 = 20 s, TMAP = 7 min) and the omni-domain power–duration model (Puchowicz, Baker & Clarke 2020) for power, fitted to the bests of every length from 30 s to 2 h, its decline fixed at 0 without a best past 30 minutes; it then draws the curve, gives the predicted times (v(T)·T = d) and the fitness markers' predictions. At least 3 bests for (1) and (2), 4 for (3) with one of 3 minutes at most and one of 10 at least."
status: "accepted"
---
