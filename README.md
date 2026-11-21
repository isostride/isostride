# Strideprism

Strideprism analyses your running metrics: pace, heart rate, cadence, ground contact time, vertical oscillation, step length, power and leg spring stiffness. It compares like with like. You choose a **block**: a rule such as "the fastest 5 minutes with the heart rate above 160", "laps of 3 to 5 km" or "the runs since March", or a stretch of route or a workout lap the app found in your runs. The app selects every segment the block describes in your history and checks two things:

- **Analysis:** whether a metric changes over time within that block.
- **A/B comparison** (a tab of Analysis, on the items chosen there): whether two groups of instances differ, for example two pairs of shoes, two watches or a technique cue. The answer comes with a 95% interval and the noise level of your own data.

It is an analysis tool, not a training planner.

The app runs entirely in the browser. There is no server and no account, and nothing is sent anywhere. Your FIT files and everything derived from them stay in a folder on your computer.

## Requirements

- **Chrome, Edge or Opera** on a desktop. The app needs the File System Access API (`showDirectoryPicker`). Firefox and Safari get a "not supported" message.
- Node.js 20 or later, to build or run it locally.

## Getting your data in

1. Export your runs from COROS as **FIT** files. Use the COROS app or Training Hub: open an activity and choose Export → FIT. Put the files in one folder, either directly or in a `fit/` subfolder.
2. Open the app and click **Choose data folder**. The browser asks for read and write access once. The app remembers the folder and asks again only if the browser drops the permission.
3. Click **Import folder**. Each FIT file is imported once. If you add new files later, import again: only the new ones are processed. A file that cannot be read (damaged, or not a run) is skipped and listed with the reason.

The app writes its own data next to your FIT files:

```
<your folder>/
  *.fit or fit/*.fit             your exports, never modified
  strideprism/
    user/                        what you entered
      gear.json                  shoes and heart-rate sensors with dates
      run-tags.json              workout type and technique cue per run
      block-definitions.json     your blocks and their tolerances
      settings.json              the zones of your metrics and the load model
    derived/                     everything computed from the FIT files, rebuildable at any time
      manifest.json              which files were imported, schema and algorithm version
      runs/<id>.json             samples per run (columnar JSON)
      runs-index.json            one row per run with its context
      segments.json              route segments found in your history
      block-instances.json       every instance of every block, with why it was accepted or not
      recommendations.json       suggested blocks
      day-state.json             the load of the previous 3 and 7 days, and the form
      load-summaries.json        what the load models need of each run, so a change of model reads no run file
      stamp.json                 the state of the data the cache was computed for
      cache/                     rule segments and curves, computed once for that state
```

**Recompute everything** (on the Runs screen) deletes `derived/` and rebuilds it from the FIT files; deleting `derived/` by hand and importing again does the same. Use it after an update that changes the algorithms; the app tells you when that is needed. It never touches `user/` or your FIT files.

## Screens

- **Runs:** import, and your runs as a calendar of weeks (Monday to Sunday, each run a tile opening it, the week's distance, time, runs and pace at the end of the row) under the weeks at a glance (this week against the 4 weeks before, the distance of the last 12 weeks as bars). Search by words (title, note, type, shoes, date such as "october" or "2026-10"), workout type or distance; go to a month or back to today. *List* shows the table of runs, where you tag them (title, workout type, technique cue, shoes, note).
- **Run:** everything on one screen: one chart with up to four metrics laid over each other, each line on its own scale, the map and the laps on its right, and under them the min, avg and max of the metrics shown. Zoom with the mouse wheel at the pointer, on the chart or the map; drag the map or the overview strip to move along the run, and the chart follows. What the chart shows is the selection: drag on the chart, scroll, move the map or click a lap, and the statistics below are those of the range shown; the ✕ goes back to the whole run. Make a block of it from the Chart menu. The zones you set in Settings colour each metric's band. The whole view (range, metrics, lines, axis, smoothing, map) is kept in the link and remembered for each run, so a reload or coming back shows it as you left it.
- **Analysis:** choose the data and analyse it in one place. *+ Add block or run* opens a picker: build a block from a rule (whole runs, laps, the fastest stretch of a length, or a steady stretch; in which runs; what the segment must meet on average and at every moment), with the segments it selects counted as you type; or take one of your kept blocks, a block found in your runs (a route segment you ran at least 5 times, a lap set up in at least 3 workouts), or a single run. Up to four items are compared for several metrics over time, raw or corrected for pace, each block with its trend line, noise threshold and verdict, its segments listed and ranked, and a curve of the bests by length of time with an estimate, each in its own tab: *Trends* (the charts over time, the table of changes, the verdicts), *Segments* (ranked) and *Pace / power curve*, where *Speed* draws the fastest stretches as a pace (with predicted race times and critical speed), *Power* the highest average power (with critical power and W′); the estimate's parameters stand under the chart, and the table of bests opens the run of each one with its stretch selected. A block built from a rule lives in the link; *Save* keeps it in the folder.
- **A/B** (a tab of Analysis): two groups of an item's segments by shoes, heart-rate source, watch, workout type or technique cue, with the difference, its interval and warnings (too few instances, groups not interleaved in time, mixed watches).
- **Performance**: what your runs say about you, laid out by what each model rests on, with its assumptions checked against your data. The screen stays simple: a model shows its name, its number, its chart and how far it can be trusted (reliable, rough, not reliable); *Why?* beside it opens the rest — why it has that trust, its assumptions with what your data show, what it rests on, what it is and how to read it. *Overview* is one line per model, each under what it is computed from, no model being more reliable than that. *Load* (from every run): fitness, fatigue and form with the acute:chronic ratio; each week's load, monotony, strain and ramp rate; the time in your heart rate zones. *Capacity* (from your all-out efforts): the best efforts of 2–20 minutes with the evidence that each was all-out (the heart rate in it, the run it comes from), then critical speed and D′, critical power and W′, the predicted race times and VDOT, all fitted to them. *Aerobic* (from everyday runs): the efficiency factor, the decoupling of long runs, VO2max from heart rate and Uth's ratio. *Response*: Banister's model fitted to your own performances. *Model*: how a run's load is counted (Banister TRIMP, Edwards TRIMP, rTSS or Power TSS, the threshold pace and critical power taken from the curve of the last 90 days unless you set them), your resting and maximum heart rate, and the time constants; saving recomputes every load. Each run shows its load and the form that morning, each week of the calendar its load, and the context of the segments the load of the 3 and 7 days before.
- **Settings**, in tabs: *Zones* (the zones of each metric, pace as m:ss per km, heart rate zones from your maximum heart rate, coloured on the run chart; until you save your own, default zones for heart rate, pace and cadence apply), *Gear* (shoes and heart-rate sensors with the dates you used them) and *Tags* (workout types and technique cues), kept in `user/`.

Search with ⌘K or Ctrl+K. The theme is light, dark or follows the system.

## Development

```sh
npm install
npm run dev        # dev server on http://localhost:3000
npm run build      # static export into .next-build/
npm run typecheck
npm test           # unit and integration tests (Vitest)
npm run e2e        # end-to-end tests (Playwright: Chromium, plus WebKit for the not-supported message)
npm run check      # tests + e2e + metrics, then radical check against the architecture model
```

The first `npm run e2e` needs the browsers: `npx playwright install chromium webkit`.

Most tests read real FIT files from `test_data/coros_fit_2026/`. That folder holds personal health data, so it is not in the repository. Without it, the tests that need it fail.

### Architecture model

The architecture model lives in `.radical/model/`. It holds requirements, scenarios, fitness functions, ADRs and a C4 model. `.radical/radical.json` binds the tests to the scenarios and fitness functions they verify, and binds each model element to its source paths. `npm run check` records the measurements the tests produce, such as import time, recompute time and external network requests, as the model's metrics. It then reports which requirements are verified.

Code layout:

| Path | What |
|---|---|
| `app/`, `components/` | pages and UI (main thread) |
| `workers/pipeline.worker.ts` | the Processing Worker: import, recompute, context, blocks, rules computed on demand, pace curves |
| `lib/fs` | folder access and the manifest |
| `lib/ingest` | FIT parsing and import |
| `lib/prepare` | 10 s windows, route segments |
| `lib/context` | gear, tags, day state |
| `lib/blocks` | block definitions and rules (types and pure helpers) |
| `lib/detection` | segments of a block in a run, recommendations |
| `lib/compare`, `lib/stats` | trend, A/B, regression and bootstrap |
| `lib/curve` | pace curve and its estimate |

All heavy processing runs in the worker. An architecture test fails if main-thread code imports the processing modules.
