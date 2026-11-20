---
id: "d72ff93a-47b3-4b30-937d-abc0d5f8fe77"
type: "scenario"
label: "Laps and steady stretches by a rule"
given: "a workout of a warm-up, a 3 km lap at 4:00/km and a cool-down, an easy run of one lap, a run with 12 minutes at 5:00/km between easier parts, and a run with a stop of a minute"
then: "the lap rule finds the workout's effort lap alone, every lap gives three and the best of the run its fastest; the steady rule finds the 12 minutes and nothing when 15 are asked for; a stop breaks a stretch"
when: "a rule asks for laps of 2.5–3.5 km at 3:55–4:05 /km, for every lap or the best of each run, and for stretches where the pace stays within 4:50–5:10 for 10 minutes or more"
---
