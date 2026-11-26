---
id: "2cc97e54-4899-4f94-9b8c-24845459f7c0"
type: "requirement"
label: "Weekly load, monotony and strain"
action: "show each week's load by the chosen model, its monotony (the mean daily load over its standard deviation) and strain (the week's load times its monotony), and the ramp rate (the change of fitness over the week)"
ears_type: "event-driven"
rationale: "The runner asked to add what helps to judge performance (\"dodaj brakujace elementy .. ktore pomoga w ocenie wydajnsoci\"). On 25 Nov 2026 the review of the models found the current week's monotony counting the days to come as rest; the runner: \"ok popraw wszystko pokolei\". On 26 Nov 2026 the second review found the monotony over the days so far unstable (a Monday of 100 and a Tuesday of 90 give a monotony of 19 and a strain of 3610; proposed \"the last 7 days up to today\") and the first week's ramp equal to the load the averages start from (50 for a constant 50 a day, then 0); the runner: \"zrob wszystkie\". Model's choices: Foster's monotony and strain (Foster 1998), a monotony above 2 marked as a guide; the monotony and strain of a week not over yet over the 7 days up to today (as many as the history has), the week's load its own days so far; the ramp rate as the change of fitness (CTL) per week, the first week's from the end of its first day; Monday-to-Sunday weeks."
trigger: "the user opens the Weekly load view of the Load tab of Performance"
---
