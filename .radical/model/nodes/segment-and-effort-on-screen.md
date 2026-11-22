---
id: "dee907bd-7d05-45b5-a939-e6d54cb9d154"
type: "adr"
label: "Segment and effort on screen"
consequences: "The words of the screens and of the model differ: a requirement's \"block\" is a Segment on screen and its \"segment\" or \"instance\" an Effort; links with tab=segments still open the Efforts tab."
context: "\"Block\" is a training block to a runner, weeks of a plan, and \"stretch\" reads as stretching; the runner chose \"segment + effort\"."
date: "2026-11-22"
decision: "On every screen a block is a Segment (the same part taken from many runs, the Segments screen at /segments, /blocks leading there), each of its instances an Effort (\"12 efforts in 12 runs\", the Efforts tab of Analysis), the fastest of a length a best effort, and the part chosen on a run a selection or part of the run; the code and the model keep block, instance and segment for what they were."
status: "accepted"
---
