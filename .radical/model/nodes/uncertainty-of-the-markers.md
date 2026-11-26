---
id: "56d9fdc9-3727-448c-9c63-800cceadb062"
type: "requirement"
label: "Uncertainty of the markers"
action: "show with today's critical speed, D′, critical power, W′ and each predicted race time the range it may lie in by the bests it rests on, and judge in the checks of critical speed and critical power whether that range is narrow"
ears_type: "event-driven"
rationale: "The review of the models (\"przegladnij modele wydolonosci ... znajdz luki i sugestie poprawy\") found no uncertainty given for critical speed, D′ and the predictions; asked \"a tez rzeczy poza pr?\", then \"Poza PR zostały trzy nowe funkcje: niepewność CS, D′ i prognoz\". Model's choices: the range by the jackknife (Quenouille 1949; Tukey 1958): the model fitted again by the same envelope with each best left out in turn, its standard error √((n−1)/n · Σ(θᵢ − θ̄)²), and ± Student's t of n−1 degrees for 95 %; for today's values only (week by week it would refit every week n times); none under 4 bests; the check holds with standard errors of 5 % or less of the critical speed (power) and 10 % or less of D′ (W′), the bounds used in the critical power literature for a fit's standard error, and is in doubt past them, not unmet: the envelope may leave out a best it rested on, so a wide range means the value rests on one best or two; the predicted times with their range, by the curve model chosen."
trigger: "the user opens the Critical speed and power view or the Predictions and VDOT view of the Capacity tab of Performance"
---
