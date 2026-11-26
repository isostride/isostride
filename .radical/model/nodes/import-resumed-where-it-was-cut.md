---
id: "c9c07b89-a0ed-489c-8f7d-db66e6317a60"
type: "scenario"
label: "Import resumed where it was cut"
given: "three FIT files imported with the index and the manifest written after each, the import cut off as the third starts; a run and a hike imported, the manifest then as it was before the run; and a file with two records out of order and one dated a year on"
then: "the first two files are kept as imported and the third alone is read, the three joined; the run is no duplicate of itself, its context is joined, and the hike is not read again; the run's samples are in the order of their time without the record a year on"
when: "the next import runs, and the file is read"
---
