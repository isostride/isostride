---
id: "c2209298-ad42-48e4-b873-6c72a8310840"
type: "scenario"
label: "Copy read, folder kept whole"
given: "a folder with the app's files and an empty copy"
then: "the first read comes from the folder and fills the copy, the second from the copy alone; the write and the removal reach both; the FIT file and the listing come from the folder; a different stamp drops the copy"
when: "the app reads a file twice, writes one, removes one, reads a FIT file and lists the folder; then the folder's data stamp changes outside the browser"
---
