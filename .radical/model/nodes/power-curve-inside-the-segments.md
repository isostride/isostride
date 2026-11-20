---
id: "b88206c8-f882-4add-996c-d84e0d10edc0"
type: "scenario"
label: "Power curve inside the segments"
given: "a run of 30 minutes at 200 W with 10 minutes at 300 W in the middle, and a run without power"
then: "every length up to 10 minutes has 300 W, longer ones mix in the easier power, the first 10 minutes have 200 W, the run without power has no point, the higher of two bests is kept across runs, and the estimate recovers CP and W′ with no best above the power law"
when: "the power curve is computed over its whole and over its first 10 minutes, and the estimate fitted to bests that follow critical power"
---
