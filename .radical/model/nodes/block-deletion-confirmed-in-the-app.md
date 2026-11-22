---
id: "0cc567d0-0a83-43d8-89ee-d1b377bd057b"
type: "scenario"
label: "Block deletion confirmed in the app"
given: "a kept block on the Blocks screen"
then: "the app's dialog \"Delete this block?\" names the block, Cancel focused; Esc closes it and the block stays; the confirmed delete removes it"
when: "the runner presses Delete in its row, presses Esc, then presses Delete again and confirms with Delete in the dialog"
---
