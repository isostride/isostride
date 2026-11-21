---
id: "22d6df09-ddc7-4b2a-b735-e4b8aab92b10"
type: "requirement"
label: "Fitted performance model"
action: "fit Banister's impulse–response model (performance = p0 + k1·fitness − k2·fatigue) to the runner's daily loads and performances, show its parameters, how well it fits (R²), the measured and modelled performance over time, and, resting from today, the projected performance and the day it peaks"
ears_type: "event-driven"
rationale: "Offered \"dopasowanie wag modelu Banistera do Twoich wynikow\" (fitting Banister's gains to the runner's results, on the data of the fitness markers) as a later step, the runner answered \"mozesz to zrobic\". Model's choices: the performance chosen between VO2max from heart rate per run and the weekly VDOT from the bests; the time constants by a grid search (fitness 15–60 days, fatigue 2–20 days, fatigue shorter) and p0, k1, k2 by least squares with positive gains; at least 8 performances over 6 weeks; the projection over 42 days of rest."
trigger: "the user opens the Response tab of Performance"
---
