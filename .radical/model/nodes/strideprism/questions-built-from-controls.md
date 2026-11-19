---
id: "5ba5e99c-da08-4beb-bd36-da1fd533abce"
type: "adr"
label: "Questions built from controls"
alternatives: |
  1. Free text read by a grammar of the app's own (built first, dropped at the runner's request): questions in words, but a fixed set of shapes and the runner's correcting by rewording.
  2. A language model through an API (Claude): any wording, but a key, the network and a summary of the runs leaving the computer, and answers that vary.
  3. A small model in the browser: free text offline, but tens of megabytes and slow on a laptop.
consequences: |
  • Every question is one of three shapes with a few parameters; a new shape is a new control and a new branch of the answer.
  • The same question always gives the same answer, so scenarios can state the answer word for word, and a link reproduces a question.
  • Nothing changes for Data stays local: the fitness function on network requests covers the Ask screen too.
context: "The runner wants to ask questions about the data (\"pokaz mi jak sie zmieniala efektywnosc od lutego\") and, having seen a free-text box, asked for structured search instead: \"nie chce wpisywac tekstu chce bardzije strukturalne wyszukiwanie\". The app sends nothing over the network (Data stays local), each route has a 200 KB script budget, and the answers must be deterministic and testable."
date: "2026-11-19"
decision: "A query built from controls in lib/ask and the Ask screen: the kind of answer (change over time, fastest stretch, highest or lowest), the metric, the length of a stretch (presets or a number with its unit), the period (presets or two dates) and the filters (workout type, shoes, title, length of the ranking). The question is serialised into the link (kind, metric, direction, window, from, to, tag, shoes, title, top) and read back from it. The answer is computed in the Processing Worker from the runs index and the run files, with the same Trend rule as blocks use, afresh after each change of a control; a superseded computation is abandoned. No free text and no grammar: the runner's choice."
status: "accepted"
---
