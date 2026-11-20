---
id: "b77c2579-a694-46f3-b57d-9896de47072a"
type: "requirement"
label: "Trend of a selection"
action: "show in its statistics the trend of each metric shown as its change per 10 minutes, and the decoupling of pace from heart rate over the stretch"
ears_type: "event-driven"
rationale: "The runner asked: \"linie tredu ?\", then: \"zrob 1,2 i 3\". The model's choices: a trend only within a selection and as a number, not a line over the whole run, where intervals and warm-ups make a straight line misleading; the trend is the least-squares slope of the 10 s windows with movement, given per 10 minutes, for a selection of 1 minute or more; the decoupling (Pa:HR) compares the efficiency, speed per heartbeat, of the stretch's first half with its second, in % (positive: the heart rate drifted up against the pace), as it is reckoned in endurance training (Friel, The Cyclist's Training Bible / TrainingPeaks)."
trigger: "the runner selects a stretch of a run"
---
