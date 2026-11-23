---
id: "d3fb5710-54c5-4fe4-9969-e73257747c7c"
type: "adr"
label: "Metrics from the file"
alternatives: |
  1. Keep the fixed list and add fields one by one: each watch or app waits for a change of the app.
  2. Read only the developer fields generically: a standard field such as respiration rate is still lost.
consequences: |
  • A metric the file holds reaches every screen without a change of the app.
  • The derived data changes shape (schema 2): a folder recomputes once.
  • A metric's direction is unknown until the runner sets it, so its verdicts are worded neutrally.
context: "The metrics were a fixed list in eight places (kernel, blocks, compare, zones, run screen, charts), so a watch with other fields (Garmin's respiration rate, Stryd's fields, COROS' own Form Power and Air Power) lost them at the import. The runner chose every numeric field as a metric, everywhere, neutral when unknown (\"Wszystkie liczbowe\", \"Wszędzie\", \"Neutralnie + ustawienie\")."
date: "2026-11-23"
decision: "One catalog of metrics (lib/kernel/metrics.ts): each metric a key, a name, a unit, an origin (standard, developer, derived), a direction (higher better, lower better, neutral) and a display (value or pace). The import makes a metric of every numeric field of a record; the known ones keep their keys and their look, an unknown one takes its name and unit from the file. Samples and windows hold the metrics in a map; each run lists its metrics and the folder keeps the catalog of all (derived/metrics.json). Everything else reads the catalog; only the metrics with a meaning of their own (speed, heart rate, effort pace, power, altitude) are named in code."
status: "accepted"
---
