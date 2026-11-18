---
id: "ee1fabf2-790e-4692-b839-eb7bbda5b35e"
type: "scenario"
label: "Analysis without run files"
gherkin: "And every row of block-instances.json holds shoes, sensor, tags and day state"
given: "an imported folder with Block Instances"
then: "only runs-index.json and block-instances.json are read, no runs/<id>.json"
when: "the user opens a Trend and an A/B Comparison split by shoes"
---
