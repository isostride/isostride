---
id: "f2b45101-eae1-486b-9c37-7905de9fad0a"
type: "adr"
label: "Models grouped by evidence, assumptions checked"
alternatives: |
  1. Notes under each chart (as before): prose the runner must apply to their own data by hand; says nothing about whether it holds.
  2. Hiding a model whose assumptions fail: cleaner, but the runner cannot see what is missing or how far off it is.
  3. Asking the runner to mark efforts as all-out by hand: the most reliable evidence, and more bookkeeping; the heart rate evidence comes first, a manual mark can be added.
consequences: "Every number comes with what it rests on and a verdict the runner can question. The heart rate evidence is circular when the maximum heart rate is taken from the runs (the hardest run is then all-out by definition), so that case is marked doubtful and independent checks (separate efforts, the shape of the curve) stand beside it. The thresholds are the model's choices and are stated with each check. The first context after this version reads every run file once to rebuild the summaries."
context: "Performance had grown to eight flat tabs of models added one by one. The runner found them mixed, and asked what each depends on and assumes: a critical power from bests that were never all-out is worthless, and nothing on the screen said so."
date: "2026-11-21"
decision: "A registry of the models (lib/load): each with its group by evidence (load, capacity, aerobic, response), what it rests on (data, settings, parent models) and its assumptions as checks computed from the summaries, the index of runs and the settings. A check is met, doubtful, unmet, or unknown (the files cannot tell; the runner must judge); a model's trust is the worst of its checks, capped by its parents'. The summary of a run keeps, for each best of 2–20 min, where it lies and the highest heart rate in it (summary version 3), so a best can be classed all-out, hard or easy against the maximum heart rate, and nested bests of one effort told from separate efforts. The screen is laid out by the registry: an Overview tree, a tab per group with its views; a model shows its name, value and trust, and its checks, what it rests on and how to read it open on demand, behind its \"Why?\" (the runner's request to keep the screen simple)."
status: "accepted"
---
