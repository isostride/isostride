---
id: "0931a169-208c-49d3-8331-23f0eb457450"
type: "scenario"
label: "Zone boundary with a decimal comma"
given: "the boundaries \"9,5; 10,5; 11,5\", \"9,5 10,5\", \"114, 133,152\", \"114,133\" and the paces \"5:30, 5:00; 4:30\""
then: "the first two read 9.5, 10.5 (and 11.5); whole numbers and paces are separated at their commas as before; boundaries with decimals are shown between semicolons and read back the same"
when: "they are read as the zones of a metric, and boundaries with decimals are shown in the field"
---
