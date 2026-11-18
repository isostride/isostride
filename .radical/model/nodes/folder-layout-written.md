---
id: "268bbc38-070f-4451-a3a6-dcd1fcbb4684"
type: "scenario"
label: "Folder layout written"
gherkin: "And manifest.json lists the imported files with the schema and algorithm versions"
given: "an empty data folder with FIT files in fit/"
then: "strideprism/ holds manifest.json, user/gear.json, user/block-definitions.json and derived/ with runs/<id>.json, runs-index.json, segments.json, block-instances.json and day-state.json"
when: "the user imports the folder, registers one Gear and accepts one Block Definition"
---
