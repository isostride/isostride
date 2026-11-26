---
id: "2d63ee20-cde9-4b09-b2ba-4aba65369254"
type: "scenario"
label: "Each job its own state"
given: "two reads of the same kind running at once, then an import, then a read started and ended during the import"
then: "the second read stays shown; the import is shown with its progress through the short read; after the import the read still running is shown; then none"
when: "the first read ends, the import reports its progress, the short read ends, the import ends, the last read ends"
---
