---
id: "12c280f2-b83b-49fd-a069-3637f956a990"
type: "scenario"
label: "Version released with its notes"
given: "a changelog with two notes under Unreleased and a section 0.1"
then: "the notes are under \"## 0.2 — <date>\" with an empty Unreleased above; the notes of 0.2 and 0.1 read back, of 0.3 none; releasing with nothing unreleased or a version there already is refused; the lock file's root and workspaces get 0.2.0, its dependencies stay"
when: "the version 0.2 is released"
---
