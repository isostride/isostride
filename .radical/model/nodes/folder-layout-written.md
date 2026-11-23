---
id: "268bbc38-070f-4451-a3a6-dcd1fcbb4684"
type: "scenario"
label: "Folder layout written"
gherkin: "And manifest.json lists the imported files with the schema and algorithm versions"
given: "an empty data folder with FIT files in fit/"
then: ".isostride/ holds user/gear.json, user/block-definitions.json and derived/ with manifest.json, runs/<id>.json, runs-index.json, segments.json, block-instances.json and day-state.json; a manifest.json left at .isostride/ by an earlier version is moved into derived/; data left in strideprism/ by an earlier version is moved to .isostride/ whole, strideprism/ removed"
when: "the user imports the folder, registers one Gear and accepts one Block Definition"
---
