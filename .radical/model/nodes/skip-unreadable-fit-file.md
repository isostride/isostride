---
id: "e2655705-21da-4c0c-a826-88ae821ed3dd"
type: "requirement"
label: "Skip unreadable FIT file"
action: "skip that file, continue importing the other files, show the file on the Runs screen with the reason, and try it again on the next import"
ears_type: "unwanted-behaviour"
rationale: "User's answer on import failures."
unwanted_condition: "a FIT file in fit/ cannot be imported (damaged, or not a run)"
---
