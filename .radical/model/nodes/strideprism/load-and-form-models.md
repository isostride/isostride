---
id: "a7abb030-0525-410d-91de-f857c91ba688"
type: "adr"
label: "Load and form models"
alternatives: |
  1. Session RPE (Foster 2001): minutes × perceived effort; simple and valid, but FIT files carry no effort rating, and the runner would have to enter one for every run.
  2. Lucia's TRIMP: three zones by the ventilatory thresholds; needs thresholds from a lab test the app cannot know.
  3. A fitted impulse–response model (Banister with gains k1, k2 fitted to performances): it predicts performance, but needs regular maximal tests to fit; kept for later, once the curve's critical speed is tracked over time.
  4. Computing each run's load when the run is imported: fast to read, but every change of model or parameter would need every run file read again.
consequences: "Changing the model is fast: loads are recomputed from the summaries. The first context after this version reads every run file once to build the summaries. Loads of different models are not comparable; the unit is named with every number. A run without the data its model needs gets an estimate from its duration, marked as such."
context: "The runner wants a performance model set in Settings (\"TRIMP, critical pawer based\") and chose four load models, the form chart as an Analysis tab, and the model's load in place of the minutes of running in the context. Heart rate, pace and power are in the run files; the settings may change at any time, and the context is computed in the Processing Worker."
date: "2026-11-20"
decision: "Two layers. A run's load from one of: Edwards TRIMP (minutes in the HR zones of Settings × zone number; Edwards 1993), Banister TRIMP (minutes × HRr × 0.64·e^(1.92·HRr), women 0.86·e^(1.67·HRr); Banister 1991), rTSS (hours × (normalised effort speed / threshold speed)² × 100) and Power TSS (hours × (normalised power / CP)² × 100), the normalisation a 30 s rolling mean to the 4th power, the thresholds the critical speed and power (Monod–Scherrer fit of the bests of 2–20 min) of the 90 days up to the run unless set by hand. The response: Banister's fitness–fatigue model as exponentially weighted averages (fitness τ 42 d, fatigue τ 7 d, form = fitness − fatigue of the day before), and the acute:chronic ratio from 7 and 28 day averages. The settings-free part of each run (seconds per bpm, normalised speed and power, bests) is kept in derived/load-summaries.json, built once per run, so a change of model or parameters needs no run file read."
status: "accepted"
---
