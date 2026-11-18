---
id: "36038f78-a505-4196-a7a7-9dbac6a637e8"
type: "requirement"
label: "JavaScript within budget"
action: "keep the JavaScript a route loads before it is interactive within 200 KB compressed, loading the rest on demand"
ears_type: "ubiquitous"
rationale: "JavaScript is the costliest byte on a phone: it is downloaded, parsed and run on the main thread, which is what INP measures (web.dev, Performance budgets 101)."
---
