---
id: "652fa653-b7a0-4849-a7d8-2c79eec3c3d9"
type: "requirement"
label: "Confirmations in the app"
action: "ask in a dialog of the app's own, never the browser's, saying what will happen, with Cancel and a button naming the action; Cancel, Esc or a click beside it change nothing"
ears_type: "event-driven"
rationale: "The runner asked: \"usuwanie lelemntow powodu pokazanie sie wbudowanego popupa chrome ... chce miec wlasny w aplkacji\". Model's choices: every confirmation of the app (deleting a block from its row or its editor, Recompute everything) in one dialog over the screen; Cancel focused first and Tab kept between the two buttons; the button of a change that cannot be undone in the error colour (Delete); Esc closes only the dialog, not an editor under it."
trigger: "the runner starts something that asks to be confirmed (deleting a block, recomputing everything)"
---
