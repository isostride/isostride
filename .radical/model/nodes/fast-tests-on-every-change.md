---
id: "c5829292-1066-494a-9c63-78abe795aa96"
type: "requirement"
label: "Fast tests on every change"
action: "run the unit and integration tests within 10 minutes and block the merge on any failure"
ears_type: "event-driven"
rationale: "Feedback that takes longer than about ten minutes is no longer waited for, and changes pile up untested (Fowler, Continuous Integration: keep the build fast)."
trigger: "a pull request is opened or updated"
---
