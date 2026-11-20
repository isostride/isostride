---
id: "3b2a5032-9b62-4e79-a7f6-b568f1399963"
type: "scenario"
label: "Curves from the data folder"
given: "a data folder with three runs, each with 10 minutes at 4:00/km in its middle; one item holds the efforts of the first two, another the easy first 10 minutes of the third"
then: "each run named is read once, with progress, and a run that is no longer there is passed over; the first item's curve reaches 10 minutes at 4:00 /km from one of its two runs, the second's stays at 6:00 /km from the third run; an item with no stretches has an empty curve"
when: "the pace curves of both items are computed together"
---
