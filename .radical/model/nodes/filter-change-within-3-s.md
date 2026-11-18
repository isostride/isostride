---
id: "4f0cddbc-e222-42f9-bd63-ca73494e743d"
type: "scenario"
label: "Filter change within 3 s"
given: "the A/B Comparison of the promenade segment over the author's data"
metrics: "compare.ab.duration.max <= 3 s"
then: "the recomputed comparison with its bootstrap uncertainty interval is shown within 3 s"
when: "the user changes the splitting field from shoes to workout type"
---
