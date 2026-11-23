---
id: "27bfbb75-0d7b-42a4-abeb-12bbcbb68e50"
type: "adr"
label: "Pace curve models"
alternatives: |
  1. A regression line through the bests (built first): describes the typical level, but leaves the strongest bests above the estimate and lets easy long runs pull the predictions down.
  2. The critical speed model alone, drawn over the axis: a clean two-parameter fit, but it predicts the critical speed held forever, so it overstates every effort beyond about 20 minutes.
  3. A three-parameter critical power model (Morton 1996) or the Péronnet–Thibault model: closer to physiology, but ill-conditioned with a handful of uneven bests.
  4. A fixed Riegel exponent of 1.06 through the single best stretch: no fit needed, but the runner's own endurance (or the lack of a hard long run) is what the curve should show.
consequences: |
  • The estimate is the potential the bests imply, not the typical level; it never lies below a measured best.
  • An easy long run still steepens the slope (a higher exponent), and the exponent is shown, so a strange fit is visible (1.06–1.08 for trained runners; higher means the long bests were not hard).
  • Predicted times follow the envelope: fair for 5 km to the marathon from a strong 10 km, and optimistic for the marathon without hard long runs.
context: "The runner wants an estimated pace curve \"bazujac na researchu\" beside the measured one (the fastest stretch of each length across the runs). The curve must be computed from a few best efforts of uneven quality (an easy long run is the only effort of its length), on the computer, deterministically."
date: "2026-11-19"
decision: "Two models from the literature, fitted to the item's own best stretches: (1) Riegel's power law (Riegel 1981, Athletic records and human endurance): time ∝ distance^b, so speed ∝ time^(−k); the exponent k is fitted by ordinary least squares in log–log to the bests of 3 minutes and more, and the level is then raised to the strongest best, so the line is an envelope no measured best lies above — the law describes a maximal effort, and an easy long run is no such effort (the runner's choice, after seeing bests above a regression line). It is drawn dashed over the whole axis and gives the predicted times of 5 km, 10 km, the half and the marathon. (2) The critical speed model (Monod & Scherrer 1965; Hill 1993; Jones & Vanhatalo 2017, Sports Medicine): distance = CS·t + D′ fitted to the bests of 2–20 minutes, the range the review gives for its validity, reported as the critical speed and D′ in the note, not drawn. At least 3 bests for either fit."
status: "accepted"
---
