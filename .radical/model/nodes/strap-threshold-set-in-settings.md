---
id: "5e16f935-da21-49c6-b592-220447275732"
type: "scenario"
label: "Strap threshold set in Settings"
given: "Settings, Models, nothing set; runs with a strap in half of them"
then: "the default 80 shows; 150 is out of range (0–100) and cannot be saved; 50 is kept in the settings file as a share of 0.5; with a strap in half the runs, the strap check of the models holds instead of being in doubt"
when: "the runner enters 150 for a heart rate strap in at least, then 50, and saves"
---
