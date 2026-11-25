---
id: "457c8016-90e8-4e54-b595-90b2639a7b21"
type: "scenario"
label: "Back to what was shown before"
given: "runs imported, the tab's history holding Runs, a run, another run and the Dashboard"
then: "it reads ← Runs, ← Run of <that run's date> and ← Dashboard, and returns to that page as the back arrow does; the run's own changes of address and redirects are passed over; a run opened with nothing of the app behind it goes back to Runs"
when: "the runner follows the back link of a run opened from Runs, from another run and from the Dashboard"
---
