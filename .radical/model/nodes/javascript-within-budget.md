---
id: "36038f78-a505-4196-a7a7-9dbac6a637e8"
type: "requirement"
label: "JavaScript within budget"
action: "keep the JavaScript a route loads before it is interactive within 240 KB compressed, loading the rest on demand"
ears_type: "ubiquitous"
rationale: "JavaScript is the costliest byte on a phone: it is downloaded, parsed and run on the main thread, which is what INP measures (web.dev, Performance budgets 101). The budget was 200 KB; with the metrics from the file the shared scripts grew and the runner chose \"Podnieść budżet do 220 KB\". With the demo the Compare screen came to 220.2 KB and the runner said \"zwieksz budzet na bundle\"; the model's choice: 240 KB, a step of 20 KB as the one before."
---
