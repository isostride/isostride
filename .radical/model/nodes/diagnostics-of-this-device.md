---
id: "c104ba57-c0ce-49ae-95ec-11b681ba4d24"
type: "requirement"
label: "Diagnostics of this device"
action: "measure on this device how long the folder takes to list, its index, settings, blocks, run files and a FIT file to read and parse, and a job in the background worker to answer, with the app's version, the device and the long tasks since the page loaded, and show them as text the runner can copy, sending nothing by itself"
ears_type: "event-driven"
rationale: "The runner reported \"isostride dziala tam bardzo wolno\" on a fast Android phone (\"motorola razr 60 ultra\", every screen), could not reach its browser from a computer (\"nie udalo mi sie polaczyc ..\") and asked for \"diagnostyka w inny sposb\". Model's choices: in About, the report in English (it is sent as it is), the run files read one after another from a folder with nothing kept so their cost shows."
trigger: "the runner chooses Run diagnostics in Settings › About"
---
