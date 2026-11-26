---
id: "f43c283f-b3a3-4199-873e-c4773079e307"
type: "requirement"
label: "Form over time"
action: "draw over time the daily load, the fitness (CTL), the fatigue (ATL) and the form (TSB = fitness − fatigue) from the loads of the chosen model, with today's fitness, fatigue, form and acute:chronic load ratio"
ears_type: "event-driven"
rationale: "The runner asked for a performance model (\"chcialbym miec model ktory modeluje performance\") and chose its place: \"Zakładka w Analysis\", then moved it out of Analysis to a Performance screen (\"czyli form na zewnatrz analytics\"). On 25 Nov 2026 the review of the models (\"upewnij sie ze sa popranie zimplementowane\") found the averages starting from zero, the ratio 1.55 on day 28 of a constant load; the runner: \"ok popraw wszystko pokolei\". Model's choices: the Banister fitness–fatigue impulse–response model with exponentially weighted averages of time constants 42 days (fitness) and 7 days (fatigue), settable in the Model tab, every average starting from the mean daily load of the first 28 days of the history (an imported history begins in the middle of training, not from rest); the form of a day taken in its morning, before its own load; the acute:chronic ratio as Williams et al. 2017 compute it, exponentially weighted 7 and 28 day averages with λ = 2/(N+1), its 0.8–1.3 band shown as a guide; the period shown chosen among 90 days, 1 year and all."
trigger: "the user opens the Form view of the Load tab of Performance"
---
