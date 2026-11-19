---
id: "fbf51618-db00-4dd1-aec6-aa5cb4d17b84"
type: "requirement"
label: "Blocks from criteria"
action: "take as its instances the whole runs, or, when the user chooses laps, each lap, that meet every criterion set: the run's title containing a text, distance, pace, duration, average heart rate and number of laps within a range, a workout type, technique cue, shoes, heart rate source or watch among those chosen, and a date range; and show, as the user types, how many runs (and laps) meet the criteria, with the newest listed"
ears_type: "event-driven"
rationale: "The runner asked: \"chce opcji tworzenia wlasnych blokow .... poprzez kryteria i real time filtrowanie\", with \"dystans od 3 do 5 km, tempo pomiedzy 3:55 a 4:05\", \"z tagiem XXX\" and \"kombinacje powyzszych\"; the criteria groups are the ones chosen (\"Tagi i sprzęt, Dystans, tempo, czas, Daty i zegarek, Tętno i laps\") and the instance is \"Do wyboru w bloku\": the whole run or a lap. Combined with \"and\", an empty criterion not checked, and the general matching conditions (grade, steadiness, effort before) switched off for such a block, are the model's choices: the criteria are the conditions."
trigger: "the user defines a block by criteria"
---
