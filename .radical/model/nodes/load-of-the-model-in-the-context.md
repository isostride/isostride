---
id: "9a68dcb0-3994-4514-940a-204bd341fcfb"
type: "requirement"
label: "Load of the model in the context"
action: "compute the context's load of the 3 and 7 days before each run with the chosen model in place of the minutes of running, and add the form of the run's day to the context"
ears_type: "event-driven"
rationale: "The runner answered \"Tak, zastąp (Recommended)\" to replacing load3/load7 (minutes of running of 3 and 7 days) in the context with the chosen model's load. Model's choices: the form of the day added to the context; the context recomputed in the Processing Worker when the settings are saved."
trigger: "the load model or its parameters change, or runs are imported"
---
