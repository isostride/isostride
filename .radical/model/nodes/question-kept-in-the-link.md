---
id: "e1fb2839-eff8-4d39-a460-d51388a469d5"
type: "scenario"
label: "Question kept in the link"
given: "a question built from the controls: the fastest 10 min since 1 March with tag easy, the five lowest heart rates in October in shoes Alpha titled COROS test, or the change of efficiency since 1 February"
then: "it comes back the same with the defaults left out (kind=best&window=600s&from=2026-03-01&tag=easy); an empty or nonsensical link gives the default question, a ranking without a direction ranks the better way, and the period presets count from today"
when: "it is written into the link and read back"
---
