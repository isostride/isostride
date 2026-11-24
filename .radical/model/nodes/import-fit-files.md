---
id: "45572cbe-87cb-4089-ae6d-83edb67bb724"
type: "requirement"
label: "Import FIT files"
action: "import every new FIT file in the folder's fit/ subfolder as a Run with its Samples and Laps"
ears_type: "event-driven"
rationale: "F1. The user exports FIT files from COROS into fit/ by hand; there is no automatic sync."
trigger: "the folder is chosen, or the app opens on it, or its window comes back into view, with FIT files no import has seen (by itself: no button to press)"
---
