---
id: "e40a4e6e-be38-4d41-af2c-1f384341d35d"
type: "requirement"
label: "Blocks on the run chart on demand"
action: "draw the segments of all the run's kept blocks, or of that one block, on the chart, and draw none otherwise"
ears_type: "event-driven"
rationale: "The runner said: \"widze ze odrazu na wykresie zaznaczaja sie bloki .... jest to nieczytelne\". The model's choices: the blocks are off by default; a toggle \"Blocks\" in the chart's toolbar draws them all and is remembered in the browser; pointing at a block in the list draws it alone for as long as the pointer stays."
trigger: "the runner switches the blocks of the run chart on, or points at a block in the list of the run's blocks"
---
