---
id: "d5523fc0-5228-475a-8242-c0d8cac17086"
type: "fitness-fn"
label: "Detection reads what changed"
cadence: "triggered"
characteristic: "performance-efficiency"
combine: "all"
invocation: "automated"
metrics: |
  blocks.unchanged.run_files_read == 0
  blocks.new_shoes.run_files_read == 0
  blocks.differing_from_scratch == 0
  import.empty.run_files_read == 0
scope: "atomic"
trigger: "pull-request"
---

Detection does only what changed and gives what a detection from scratch gives (ADR "Detection does what changed"): with nothing changed, or new shoes no kept block filters by, it reads no run file; an import that adds nothing reads none; after a run added, blocks kept, new shoes and a workout type changed, its files equal those of a detection from scratch. Measured by the integration tests "Only what changed detected again, the same as from scratch" and "An import that adds nothing reads no run again".
