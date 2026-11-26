---
id: "3a63bb78-1c25-4287-8a31-2192f137a801"
type: "scenario"
label: "Model values that cannot be saved"
given: "values of the performance model as typed: in their ranges; a resting heart rate of 6, fatigue of 1 day, fitness of 150 days, a maximum of 250, a threshold pace of 1:30; a maximum of 105 under a resting 110; fatigue as long as fitness"
then: "those in range pass; each out of range is named; the maximum under the resting rate and the fatigue as long as fitness are named; from a file the maximum is then left to the app and the time constants are the defaults"
when: "they are checked, and a file holding such values is read"
---
