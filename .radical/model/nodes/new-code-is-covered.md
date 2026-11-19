---
id: "b5600968-c043-44c7-80a2-a5aa2be5d6f2"
type: "requirement"
label: "New code is covered"
action: "cover at least 80% of new and changed lines, branches included, with automated tests, measured on each check of a change"
ears_type: "ubiquitous"
rationale: "A gate on new code keeps coverage from falling without demanding that old code be fixed first (SonarQube, Clean as You Code; ISO/IEC 25010 testability). Local only for now (the author's decision of 19 Nov 2026, need \"Strideprism MVP specification\": \"Local only\"): the check of a change is npm run check before it is committed; there is no pull request or merge yet."
---
