---
id: "fd0a299b-2073-4758-a3c8-abd7a18087be"
type: "requirement"
label: "Load model chosen in Settings"
action: "compute the load of every run with that model — Edwards TRIMP (minutes in the heart rate zones set in Settings times the zone's number), Banister TRIMP (minutes weighted by the heart rate reserve, from the resting and maximum heart rate and the sex), rTSS (the normalised effort pace against the threshold pace) or Power TSS (the normalised power against the critical power) — the threshold pace and critical power taken from the curve of the 90 days up to each run unless set by hand, and show the run's load on the Run screen and each week's load in the calendar"
ears_type: "event-driven"
rationale: "The runner asked: \"chcialbym miec model ktory modeluje performance .... np. TRIMP, critical pawer based ... chce aby model byl ustawiany przez uzytkownika w ustawieniach\", and chose the load models \"TRIMP Edwardsa, TRIMP Banistera, rTSS (tempo), Power TSS (CP)\". Model's choices: Banister TRIMP as the default; the maximum heart rate taken from the runs (the highest held for 10 s) unless set, the resting heart rate 60 until set; normalisation as a 30 s rolling mean raised to the 4th power; the threshold pace equal to the critical speed and the threshold power to the critical power of the bests of 2–20 min in the 90 days up to the run; a run without the data its model needs gets its duration times the runner's median load per minute, marked estimated; the run's load on the Run screen and the week's load in the calendar."
trigger: "the user chooses a load model and its parameters in Settings"
---
