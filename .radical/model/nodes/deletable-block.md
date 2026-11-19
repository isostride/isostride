---
id: "b719ad21-3e91-4ed0-bf3d-319783d781db"
type: "requirement"
label: "Deletable block"
action: "remove the definition and its detected instances, and propose it again as a suggestion when it came from one"
ears_type: "event-driven"
rationale: "The runner asked for a way to remove blocks: \"nie mam opcji usuwania blokow\". The need says nothing more, so the rest is the model's choice: a confirmation first, because the deletion also removes the detected instances (it keeps Analysis and A/B free of a block that no longer exists); a block that came from a suggestion is suggested again, so a deletion by mistake is undone by accepting it again."
trigger: "the user deletes a block definition and confirms it"
---
