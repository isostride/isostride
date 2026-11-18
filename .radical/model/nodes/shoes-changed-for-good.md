---
id: "ce8f2aa2-16a5-4870-852e-e42d0650c315"
type: "scenario"
label: "Shoes changed for good"
gherkin: "And it suggests rotating the two pairs"
given: "every \"Shoes A\" Block Instance is before 2026-10-31 and every \"Shoes B\" one after, so groups A and B do not interleave in time"
then: "the result carries a warning about confounding with the fitness trend"
when: "the user opens the A/B Comparison split by shoes"
---
