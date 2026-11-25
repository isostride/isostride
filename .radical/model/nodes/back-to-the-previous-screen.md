---
id: "ce948ace-bcae-4bc0-843b-68941b12e0c3"
type: "requirement"
label: "Back to the previous screen"
action: "return to what was shown before the run in the browser tab's history, as the back arrow does — any screen of the app as it was left, or another run — the link naming it; Runs when nothing of the app is behind the run"
ears_type: "event-driven"
rationale: "The runner asked: \"wstecz z karty biegu powinien mnie wracac do poprzedniejgo ekranu a nie zawsze do kalendarza\" — back from the run card returns to the previous screen, not always to the calendar; later, of the link \"← Runs\": \"moze sz zostawic ale to pwoinien byc return to tego co bylo wczensiej\". Model's choices: the link kept, naming what it returns to (← Dashboard, ← Compare, ← Run of 13 Oct 2026, …); read from the browser's own history (the Navigation API, as the back and forward arrows), the run's own changes of address and addresses that only redirect skipped; without that API, the screen remembered for the browser tab (session storage); Runs when there is nothing before."
trigger: "the user follows the back link of the Run screen"
---
