---
id: "d3a03d2c-8b8d-41a1-9028-ce00ca6f8177"
type: "requirement"
label: "Journeys tested before merge"
action: "run the end-to-end tests of import, block-definition, trend, ab-comparison against the static export with 0 skipped, and fail the check on a failure"
ears_type: "event-driven"
rationale: "A broken journey is cheapest to fix before the merge; an environment per pull request keeps changes from waiting for a shared one (Vocke, The Practical Test Pyramid: end-to-end tests). Local only for now (the author's decision of 19 Nov 2026, need \"Strideprism MVP specification\": \"Local only\"): the check of a change is npm run check before it is committed; there is no pull request or merge yet."
trigger: "a change is checked before it is committed"
---
