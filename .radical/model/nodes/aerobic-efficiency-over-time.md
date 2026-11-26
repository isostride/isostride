---
id: "91d74a54-7182-48e5-b12f-bb403539e0e5"
type: "requirement"
label: "Aerobic efficiency over time"
action: "show for each run its efficiency factor (metres per heartbeat while moving) and, for runs of 45 minutes and more, its aerobic decoupling (the efficiency of the first half against the second, past the warm-up, %), the easy runs marked, each with its trend, and the values now from the runs of the days up to today"
ears_type: "event-driven"
rationale: "The runner asked to add what helps to judge performance (\"dodaj brakujace elementy .. ktore pomoga w ocenie wydajnsoci\"). On 26 Nov 2026 the second review of the models (\"kolejna runda review modelu performance w isostride .... co jest zle co bys jeszcze zmienil\") found the decoupling counting the warm-up (an even hour whose heart rate rises from 110 to 145 in the first 10 minutes reads about 4 % of drift), the easy runs taken by the zones of Settings (by default under 70 % of 190 bpm) and the values \"now\" ending on the last run, not on today; the runner: \"zrob wszystkie\". Model's choices: the efficiency factor as speed per heartbeat (the app's efficiency metric), Friel's Pa:HR decoupling for runs of 45 minutes and more with 5 % as a guide, read past the first 10 minutes of the run (the warm-up VO2max from heart rate leaves out); an easy run as one whose average heart rate lies under 82 % of the maximum heart rate (Seiler's low zone, as the intensity distribution reads it); the trend as a 28-day rolling mean of the easy runs; the efficiency now from the easy runs of the 28 days up to today, the decoupling now from the long runs of the 90 days up to today."
trigger: "the user opens the Efficiency view or the Decoupling view of the Aerobic tab of Performance"
---
