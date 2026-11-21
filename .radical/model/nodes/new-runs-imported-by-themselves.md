---
id: "2fd4011c-79a7-45bb-9151-a3712fcd769d"
type: "requirement"
label: "New runs imported by themselves"
action: "import the FIT files of the folder that no import has seen, reading only those, and say how many runs it imported"
ears_type: "event-driven"
rationale: "The runner asked: \"czy jak zaimportowalem folder i dodam nowy pojedynczy trening do niego to automatycznie bedzie zalazodwany\", and answered the model's offer by pasting it back (\"Import sam: nowe pliki wczytują się po cichu, z krótkim komunikatem\" and \"Baner\"). Model's choices: the first of the two offered, as the model recommended; no import by itself before the runner's first import, nor of a file an import failed on (the runner's next import tries it again); a look at the folder at most every 2 s (focus and visibility come together), none while another job runs; the notice for 6 s at the bottom right, above the tab bar on a phone, announced to screen readers; Analysis and Performance read the runs again when the import ends. A browser cannot watch the folder while the app is in the background, so the look comes when the app is in view."
trigger: "the app opens on a folder imported before, or its window comes back into view"
---
