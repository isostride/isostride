---
id: "8c0a0d30-4eae-411d-bd58-74d5cc17059c"
type: "requirement"
label: "Save shown for unsaved changes"
action: "show the card's Save, and hide it again once saved or when the values are back to the saved ones; lay out Settings › Models over the page's whole width, each value a row with its name and what it is for beside its field and unit"
ears_type: "state-driven"
rationale: "The runner asked: \"popraw settings dla modelu .. jest nieczytelny teraz\", \"chce aby ta jak i wszystkie sekcje mialy szerokosc strony\", then \"w tym mmonecie przycisk save jest zawsze .. powinien sie pojawic gdy cos jest zmienione ale nie zapisane\". Model's choices: a change told by comparing the values shown with those saved; Defaults of the thresholds shown only when a value is set; on a wide page the rows fall into two columns so a name stays near its field; the load models four in a row; the thresholds' card named \"Thresholds of the checks\"."
trigger: "a value of a card of Settings (the performance model, the thresholds of the checks, the zones) is changed and not saved"
---
