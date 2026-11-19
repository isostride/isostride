---
id: "a5a8aff6-8927-434e-bd7d-6a4a6f338bac"
type: "requirement"
label: "Violations fail the build"
action: "fail the check of that change before it is committed, naming the rule and the two parts involved"
ears_type: "unwanted-behaviour"
rationale: "A violation is cheapest to fix in the pull request that brings it; after the merge others start to depend on it (Building Evolutionary Architectures, atomic fitness functions). Local only for now (the author's decision of 19 Nov 2026, need \"Strideprism MVP specification\": \"Local only\"): the check of a change is npm run check before it is committed; there is no pull request or merge yet."
unwanted_condition: "a change adds a dependency the rules forbid or a cycle"
---
