---
id: "97c35bfa-4c9f-4a90-a704-08731fd60cdf"
type: "scenario"
label: "Random split negative test"
given: "the author's accepted promenade Block Instances"
metrics: "ab.random_split.no_change_trials{trials=10} >= 9"
then: "at least 9 of 10 trials return “no detectable change”"
when: "an A/B Comparison is run 10 times, each on a random split of the runs into groups A and B"
---
