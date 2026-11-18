---
id: "773d4a32-2253-4553-992e-7bea943c9669"
type: "scenario"
label: "Shoe A/B comparison"
gherkin: "And no confounding warning is shown, because the groups interleave in time"
given: "accepted promenade Block Instances, 8 run in \"Shoes A\" and 8 in \"Shoes B\", rotated between runs"
then: "it shows the difference between the two sets, its uncertainty interval and a verdict against the Noise Threshold"
when: "the user opens an A/B Comparison of ground contact time split by shoes"
---
