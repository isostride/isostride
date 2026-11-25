---
id: "b44139fd-e3bb-4b10-9e60-0c2aa1907358"
type: "requirement"
label: "A/B as a tab of Analysis"
action: "compare in two groups the segments of an item chosen in Analysis — All runs, a block built from a rule or a kept block, the item chosen there when there are several — split by a context field, in place of a separate A/B screen, with a verdict for each metric chosen above the tabs and, for the one clicked, its details"
ears_type: "event-driven"
rationale: "The runner asked \"a/b comparison to nie przypadkiem czesc analytics?\" and, offered an A/B tab in Analysis on the items chosen there, answered \"tak doloz\". Model's choices: the tab placed after Segments; single runs left out of the items to choose from (one run has no two groups); the item chosen kept in the link (ab=); \"A/B comparison\" leaving the navigation, its old links /compare?def=… opening the tab with that block; the block's \"Compare A/B\" links and the command palette pointing to the tab."
trigger: "the user opens the A/B tab of Analysis"
---
