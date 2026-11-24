---
id: "54829c19-12cb-49a0-bc4e-f0d306131dfe"
type: "requirement"
label: "New runs marked new"
action: "name the runs it added in its notice, each as its day and distance leading to the run, and mark them New on the Runs screen (list and calendar) until the runner opens the run or marks them all as seen"
ears_type: "event-driven"
rationale: "The runner asked: \"jak cos zaimprotujesz to chcialbym wiedziec co coztsalo dodnane ... albo znaczek new ... albo w notify\". Model's choices: both the badge and the notice, as the runner named either; the notice names at most 3 runs and says how many more, and stays 5 s, closed at once by its ×; the first import of a folder marks nothing (every run would be new); a recompute marks nothing; the runs marked are kept in .isostride/user/new-runs.json, so another browser on the folder sees them too; Mark as seen on the Runs screen clears them all."
trigger: "an import adds runs to a folder that held runs before (by itself, by the runner, or after a fetch from COROS)"
---
