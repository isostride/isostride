---
id: "510a6296-aa7f-45bf-964f-559be6359a85"
type: "scenario"
label: "Runs compared by their averages"
gherkin: "And the two points of the runs are joined by a line in date order"
given: "two runs added to Analysis, 6 km at 5:00/km with heart rate 140 and 4 km at 4:30/km with heart rate 155"
then: "each run is one point on each 'Over time' chart, on its date: 5:00 and 4:30 for pace, 140 and 155 for heart rate"
when: "the runner chooses pace and heart rate"
---
