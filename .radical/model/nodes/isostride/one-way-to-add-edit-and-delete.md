---
id: "c4d7ca04-8e22-452f-8054-cd1ea0eb2ff6"
type: "adr"
label: "One way to add, edit and delete"
alternatives: |
  1. Save on leaving a field: quick, but a slip is saved and nothing says it was.
  2. Undo instead of asking: the folder's files would need a history.
consequences: |
  • A runner who has learnt one screen knows the others; a deletion is never one click away.
  • The gear's dates and the metrics' directions no longer save at once: they wait for Save with the rest.
  • The e2e tests of Settings check Esc, Cancel, Save and the dialogs of Delete.
context: "Many screens add, edit and delete things, each in its own way: Remove or Delete or × or ✕, some asking first and some not, a name saved on leaving its field, a direction saved at once beside zones waiting for Save. The runner asked: \"w wielu elementach apliakcji mozna cos edytowac, usuwac i dodawac ... upewnij sie ze wszedzie jest spojny mechanism pod wzgledem UI\"."
date: "2026-11-24"
decision: "1. Kept in the folder (a segment, a saved analysis, a piece of gear, a tag, a run's tags): a row of a list opens the thing with a click (a segment in Compare, a saved analysis on Compare: \"przycisk open sa bezsensu ... poprostu klikam na wiersz\"), its name the row's link or button for the keyboard; its only button Edit, a pencil (components/EditButton: \"wszedzie jest slowo edit .... moze jakas ikonka?\"), 32 px in a row and 24 px in a chip, titled Edit and named \"Edit <name>\". No Delete in a list (\"lista segmentow powinna miec tylko edit i compare, w samym edit jest usuwanie\"). 2. Edit always opens a dialog in the middle of the screen (\"edit zawsze pokazuje popup na srodku w ktorym moge edytowac lub tez usuwac\"; components/EditDialog, the segment's editor in the same dialog, wide): the fields, then Delete (where it can be deleted), Cancel and Save in that order; nothing is saved before Save; Enter saves, Esc or a click beside it cancels; the first field takes the focus, Tab stays within. 3. Delete asks first in the app's own dialog (components/ConfirmDialog, useConfirm), over the editor, saying what goes and what stays, its button Delete in the danger style. 4. Taken out of a view only, nothing deleted (an item of Compare, a tile of the Dashboard, a piece of gear not yet saved in the setup): × or Remove, without asking. 5. Added: the fields and a button Add … at the end of the list; Enter adds. 6. A settings form (Metrics, the load model, the thresholds): its changes wait for Save, shown with Cancel only when something changed; Cancel goes back to what is saved. Switches of the device (theme, map background, charts) apply at once. 7. ✕ closes a panel and is named Close."
status: "accepted"
---
