---
id: "c5829292-1066-494a-9c63-78abe795aa96"
type: "requirement"
label: "Fast tests on every change"
action: "run the unit and integration tests within 10 minutes and fail the check on any failure"
ears_type: "event-driven"
rationale: "Feedback that takes longer than about ten minutes is no longer waited for, and changes pile up untested (Fowler, Continuous Integration: keep the build fast). Local only for now (the author's decision of 19 Nov 2026, need \"Strideprism MVP specification\": \"Local only\"): the check of a change is npm run check before it is committed; there is no pull request or merge yet."
trigger: "a change is checked before it is committed"
---
