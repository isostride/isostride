---
id: "9fa1f01b-3bbb-482f-82b5-b5262fff4029"
type: "requirement"
label: "Phone reads from a copy"
action: "keep a copy of the app's own files of the folder (.isostride/) in the browser's private storage (OPFS), read them from the copy, write each one to both the copy and the folder, fill the copy from the folder with each file read the first time and, in the background after the app opens, with every file of the app it lacks (the newest runs first), keep the results of the jobs in the background (derived/cache/) in the copy alone, and drop the copy when the folder's data stamp differs from the copy's when the app opens; the FIT files and the folder's listing are read from the folder"
ears_type: "state-driven"
precondition: "the app runs on an Android phone"
rationale: "The runner's phone (\"motorola razr 60 ultra\") read the folder at 0.6–1 s a call and ~3 s a file's content (diagnostics of 24 Nov 2026); asked about OPFS, the runner answered \"ok idzmy z opfs w przypadku telefonu\". Model's choices: on Android only (a desktop reads its folder fast; \"isostride.mirror\" in this browser's storage turns it on or off for a test); the folder stays the whole data (every write reaches it); the copy filled as files are read, not all at once; a copy for each folder chosen, the copy of a folder left removed; a change made to the folder outside this browser seen when its data stamp moved."
---
