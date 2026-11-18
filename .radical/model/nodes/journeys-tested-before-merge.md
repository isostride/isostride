---
id: "d3a03d2c-8b8d-41a1-9028-ce00ca6f8177"
type: "requirement"
label: "Journeys tested before merge"
action: "deploy it to an ephemeral environment, run the end-to-end tests of import, block-definition, trend, ab-comparison there with 0 skipped, block the merge on a failure, and remove the environment when the pull request closes"
ears_type: "event-driven"
rationale: "A broken journey is cheapest to fix before the merge; an environment per pull request keeps changes from waiting for a shared one (Vocke, The Practical Test Pyramid: end-to-end tests)."
trigger: "a pull request is opened or updated"
---
