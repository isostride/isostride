---
id: "c9bfc538-85b3-4df2-8fa4-cf33ae76f68d"
type: "requirement"
label: "Command palette"
action: "open a palette that searches the screens and their tabs, the runs, the blocks and the actions, shows the results in groups each with its colour and each item with its icon and a line of what it is, moves through them with the arrows, opens one with Enter and says when nothing is found"
ears_type: "event-driven"
rationale: "The runner asked: \"popraw tez poopup ktory pojawia sie jako search ... wyglada kiepsko pod wzgledem UI .. dodaj tam kolory i generalnie go oporaw\". Model's choices: the groups Screens (the accent), Runs (the brand's magenta), Blocks (orange), Actions (violet), each item an icon on a tile of its group's colour, the item in view tinted with its icon filled and an ↵ key shown; a run by its title or its weekday and date, under it its type, duration and pace, its distance on the right, found also by its month and its ISO date; with nothing typed the four screens, the five latest runs, four blocks and the two actions; a line of the brand's gradient on top, the keys in a foot, an empty state that says what to try; a combobox over a listbox for screen readers; on a phone a sheet from the bottom."
trigger: "the runner presses ⌘K or Ctrl+K, or the search of the side menu"
---
