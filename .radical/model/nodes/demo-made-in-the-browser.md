---
id: "2b434b0b-b77d-467c-88d3-3a358e2a6dda"
type: "adr"
label: "Demo made in the browser"
alternatives: "A prebuilt demo folder shipped with the app and downloaded (over 100 MB, stale the week after it is built, its dates fixed); a demo made of derived files without FIT files (screens that read the run files would show nothing); a server making it (the app has none, and the runner's rule is nothing sent)."
consequences: "Nothing to host or download and never stale (it ends the week it is opened); every screen works unchanged; the first opening costs about 5 s and the history about 15 s more behind the app, and some 300 MB of the browser's storage; a browser without the private file system's writable files cannot open it."
context: "The runner wants the site to offer a demo of IsoStride on sample data (\"mozliwosc otwara isostride z przykladowymi danymi\"), two years of a runner with a critical pace of about 3:15. The app has no server: it reads a folder of FIT files the runner picks, and Safari, Firefox and phones cannot pick one."
date: "2026-11-26"
decision: "The demo is generated in the visitor's browser, in the Processing Worker, into a folder of the origin private file system, as FIT files imported like a watch's; the app opens on it as on any folder."
status: "accepted"
---
