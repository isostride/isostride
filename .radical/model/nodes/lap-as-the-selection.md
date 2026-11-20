---
id: "ae051ad4-bb7e-4998-b355-5cae616ceadd"
type: "requirement"
label: "Lap as the selection"
action: "show the laps as horizontal bars over the chart, each a button as wide as the lap on the chart, and when one is chosen select the lap's stretch and zoom to it, as a stretch dragged on the chart is selected, with its statistics"
ears_type: "event-driven"
rationale: "The runner asked: \"daj mozliwosc wyboru lap-a jako selekcji\", then: \"lapy to maja byc pokazana jako przyciski poziome paski nad wykresem, jak na niego klikne to sie zumuje ... tak jak selekcja\". The model's choices: the strip follows the chart's x axis (by time or by distance) and its zoom; a bar is named by the lap's number and distance; the lap selected is marked on the strip and in the laps table; a double click on the chart inside a lap and a click on its row in the laps table select it too; the strip replaces the Lap list and the lap labels."
trigger: "the runner chooses a lap of the run"
---
