---
id: "5ba5e99c-da08-4beb-bd36-da1fd533abce"
type: "adr"
label: "Blocks defined in Analysis"
alternatives: |
  1. Every block computed on demand, nothing stored: one path, but A/B, the run screen and each reload of Analysis would read every run file again.
  2. Keep the Blocks screen and add the builder to it: the old flow of defining first and analysing later, which the runner found of little sense.
  3. Rewrite the found definitions (route, lap pattern, effort) as rules too: one type in the code, but a route needs a reference track and a pattern a lap layout, which a rule of ranges cannot say.
  4. A language model or a grammar for free text (built, dropped at the runner's request).
consequences: |
  • The runner chooses data and analyses it in one place; a link reproduces an analysis, rules included.
  • Two ways to a block's segments: stored for kept blocks, computed for rules in the link; both run the same detection, so the results agree.
  • A new shape or condition is a field of the rule, a branch of the detection and a unit test.
  • The same rule always selects the same segments, so scenarios state them word for word; nothing changes for Data stays local.
context: "The runner remodelled the app: \"blocks nie maja duzego sensu ... blocki sa wyliczane na biezaco z danych w analityce ... wybieram dane - czyli tworze np bloki - najszybsze 5 min przy tetnie powyzej 160 ... system wybiera mi wszystkie segmenty i je uzywa\". Three overlapping notions had grown: blocks detected beforehand, blocks from criteria and run sets. The app sends nothing over the network, reading every run file on the main thread would freeze the screen, results must be deterministic, and the A/B comparison and the run screen need a block's segments without opening every run file."
date: "2026-11-19"
decision: "One notion: a block is a rule (which runs, the shape of a segment, its conditions on average and at every moment, how many per run, the statistic) built on the Analysis screen, or one of the definitions found in the runs or made on a run's chart (route segment, workout lap, lap pattern, effort, steady fragment). There is no Blocks screen: the picker of the Analysis screen lists the kept blocks, the suggestions and single runs, and holds the builder. A rule used without keeping it lives in the link (a compact code) and its segments are computed on demand in the Processing Worker by an 'instances' job, one pass over the run files for all such rules, skipping the runs no rule draws from, abandoned when the items change. A kept block's segments stay in derived/block-instances.json, rebuilt after every import and change of gear, tags or definitions, as before. The pace curve is computed by a 'curve' job from the stretches an item holds. A rule's conditions select: its segments are all accepted, and the general tolerances are off for it."
status: "accepted"
---
