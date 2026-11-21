---
id: "81c1313d-2418-4a87-94a1-4df11223d308"
type: "scenario"
label: "Banister model fitted to performances"
given: "200 days of loads and performances every third day from a known model (p0 50, k1 0.1, k2 0.25, τ1 40 d, τ2 8 d)"
then: "the fit gives back τ1 40 and τ2 8, the gains and p0, with R² 1; resting from the day after the last load, the projection rises to a peak and falls; fewer than 8 performances, or a span under 42 days, give no fit"
when: "the model is fitted to them"
---
