---
id: "2bdfee86-5b8d-4650-a0b1-f547bf6df2f4"
type: "requirement"
label: "App version shown"
action: "show the app's version, 0.1 at first, with the commit it was built from: under the logo in the sidebar, in Settings, Display (with the build date and a link to the changelog), in the site's footer, and in every JSON file it writes to .isostride/"
ears_type: "ubiquitous"
rationale: "The runner asked: \"dodaj wersjonowanie do aplikacji, w tym momencie to 0.1\", then chose where it shows: \"Settings, Display tab; In the data folder; Site footer; Sidebar, under the logo\". The model's choices: the version is that of package.json, shown without a patch of 0 (0.1.0 as 0.1); each file written gets a field app with the version and commit."
---
