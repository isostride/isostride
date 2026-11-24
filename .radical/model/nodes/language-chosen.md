---
id: "35787f5a-a2a4-44b4-bdc7-c1ae2bf9f9fb"
type: "requirement"
label: "Language chosen"
action: "take at first the browser's language (Polish for a browser whose first language the app has is Polish, English otherwise), let the runner choose the language in Settings › Display and in the Display step of the setup wizard, keep the choice in this browser and apply it at once, without the page showing another language first"
ears_type: "ubiquitous"
rationale: "Asked how the language is chosen, the runner answered \"Z przeglądarki + przełącznik (Recommended)\" (the browser's language at first, a switch in Settings › Display and in the wizard, kept in this browser), and added \"ustawienia jezyka w settings i w wizard\". The model's choices: the browser's languages are read in order and the first one the app has wins; each language is named in itself (English, Polski) so it is found in any language; a page built in English stays hidden until it is in another language, at most 1.5 s."
---
