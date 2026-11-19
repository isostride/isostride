---
id: "bcecd863-7234-43e1-b545-4433ea3b684c"
type: "scenario"
label: "Time trial on two routes"
gherkin: "And 3 such runs make the system propose the \"5 km effort\" block"
given: "two runs on 2 different routes, each with 5 km run at 4:00/km inside an easy 6:00/km run, and one easy run at 6:00/km throughout"
then: "each of the two runs holds one instance of about 5 km at 4:00/km, and the easy run none"
when: "the effort block \"5 km effort\" detects its instances"
---
