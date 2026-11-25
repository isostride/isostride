---
id: "1f3b890f-c7bc-4503-87ca-92e0a78d4900"
type: "requirement"
label: "Saved analyses"
action: "open Analysis empty unless a link names what to show, list the analyses the runner saved on the empty screen as a table (the analysis, its segments and runs, when it was saved; the whole row opening it, Edit at its end), with one line instead when none is saved (one button to add on the screen, the head's, not 2), keep what is shown (its segments and runs, metrics and tab) under a name in the data folder, to open again or save again in place or as a new one, and delete a saved analysis from its editor once confirmed; no Save button while nothing is shown"
ears_type: "event-driven"
rationale: "The runner first asked: \"w analysis domyslnie jest all runs ... powinno zostac to co bylo w tej lub poprzedniej sesji\", then: \"albo inaczej ... powinno byl puste .. ale chce miec mozliwosc zapisania analiz\" and \"open saved analysis .. chce aby ta lista pojawila sie na ekranie analysis po wejsciu\"; later: \"jakis header ? kipesko wyglada ta tabela\", \"klikanie na caly wierszu powinno otwierac\", \"dodaj segemnt lub bieg mam w 2 miejscach\", and asked whether to keep them, \"Zostaw\". Model's choices: kept in user/analyses.json; the name asked in the app's own dialog, offered from the items' names (at most 60 characters); a name used already gets \" (2)\"; the open analysis named in the link (a=…), its button saying Saved or Save changes…; Delete asks first and leaves its segments and runs; the one line saying the head's + Add segment or run starts an analysis."
trigger: "the runner opens Analysis or saves what it shows"
---
