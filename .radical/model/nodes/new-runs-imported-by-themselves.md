---
id: "2fd4011c-79a7-45bb-9151-a3712fcd769d"
type: "requirement"
label: "New runs imported by themselves"
action: "import the FIT files of the folder that no import has seen (every one the first time), and when the app opens also those an import failed on, reading only those, and say how many runs it imported; the runner has no import to start"
ears_type: "event-driven"
rationale: "The runner asked: \"czy jak zaimportowalem folder i dodam nowy pojedynczy trening do niego to automatycznie bedzie zalazodwany\", and answered the model's offer by pasting it back (\"Import sam: nowe pliki wczytują się po cichu, z krótkim komunikatem\" and \"Baner\"). Model's choices: the first of the two offered, as the model recommended; (changed on 24 Nov 2026, after \"czy przycisk import folder ma sens ? myslalem ze aplikacja sama pobierze wszystkie pliki z folderu\" and the answer \"Usuń, wszystko samo\": the first import too is by itself, Import folder is gone, a file an import failed on is tried again when the app opens); a look at the folder at most every 2 s (focus and visibility come together), none while another job runs; the notice for 5 s at the bottom right (6 s at first, 10 s when it named the runs, 5 s and a × to close it after \"wystarczy np. 5 sekund i jeszcze dismiss\"), above the tab bar on a phone, announced to screen readers; Analysis and Performance read the runs again when the import ends. A browser cannot watch the folder while the app is in the background, so the look comes when the app is in view."
trigger: "the folder is chosen, the app opens on a folder, or its window comes back into view"
---
