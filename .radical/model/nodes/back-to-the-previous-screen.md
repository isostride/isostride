---
id: "ce948ace-bcae-4bc0-843b-68941b12e0c3"
type: "requirement"
label: "Back to the previous screen"
action: "return to the screen the run was opened from, as it was left (its link), the link naming that screen; Runs when the run was not opened from a screen of the app"
ears_type: "event-driven"
rationale: "The runner asked: \"wstecz z karty biegu powinien mnie wracac do poprzedniejgo ekranu a nie zawsze do kalendarza\" — back from the run card returns to the previous screen, not always to the calendar. Model's choices: the link names the screen (← Analysis, ← Runs, …); the screen's link is remembered for the browser tab (session storage), so its state comes back; when that screen is the page right behind in the history the link goes back in the history, restoring its scroll; Runs when there is no screen before."
trigger: "the user follows the back link of the Run screen"
---
