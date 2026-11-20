---
id: "909a96f5-edf8-4706-9ed2-f2623dc00f62"
type: "requirement"
label: "Fastest stretch that meets conditions"
action: "take, in each run the rule draws from, the fastest stretch of that length among those that meet the rule's conditions on average and at every moment and start the way it says, or, when every one is asked for, each such stretch that does not overlap a faster one, in the order of the run"
ears_type: "event-driven"
rationale: "The runner's example of a block: \"najszybsze 5 min przy tetnie powyzej 160\", and the earlier \"pokaz mi najszybszy bieg 10 min od marca\" answered \"Najszybszy fragment 10 min: W każdym biegu od marca szukany jest najszybszy ciągły odcinek 10 minut\". The model's choices: the conditions are applied while searching, so the answer is the fastest stretch that qualifies and not the fastest stretch checked afterwards; a stretch may start at any second of the run; at most 30 stretches come from one run."
trigger: "a rule asks for the fastest stretch of a length"
---
