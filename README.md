# Strideprism

Strideprism analyses your running metrics: pace, heart rate, cadence, ground contact time, vertical oscillation, step length, power and leg spring stiffness. It compares like with like. You define a **block**, meaning a stretch of route, a lap of a workout or a steady fragment. The app finds every instance of it in your history and checks two things:

- **Trend:** whether a metric changes over time within that block.
- **A/B comparison:** whether two groups of instances differ, for example two pairs of shoes, two watches or a technique cue. The answer comes with a 95% interval and the noise level of your own data.

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
    manifest.json                which files were imported, schema and algorithm version
    user/                        what you entered
      gear.json                  shoes and heart-rate sensors with dates
      run-tags.json              workout type and technique cue per run
      block-definitions.json     your blocks and their tolerances
    derived/                     everything computed, rebuildable at any time
      runs/<id>.json             samples per run (columnar JSON)
      runs-index.json            one row per run with its context
      segments.json              route segments found in your history
      block-instances.json       every instance of every block, with why it was accepted or not
      recommendations.json       suggested blocks
      day-state.json             running minutes in the previous 3 and 7 days
```

**Recompute everything** (on the Runs screen) deletes `derived/` and rebuilds it from the FIT files. Use it after an update that changes the algorithms; the app tells you when that is needed. It never touches `user/` or your FIT files.

## Screens

- **Runs:** import, the list of runs, and tags (workout type, technique cue).
- **Run:** charts and a map for one run. Select a stretch on the map or a range on a chart to define a block.
- **Blocks:** suggested blocks (a route segment you ran at least 5 times, or a lap structure found in at least 3 workouts), plus your own blocks and their tolerances.
- **Trend:** one metric across the instances of a block, raw or corrected for pace, with a noise threshold and a verdict, plus per-minute profiles inside the block.
- **A/B comparison:** two groups by shoes, heart-rate source, watch, workout type or technique cue, with the difference, its interval and warnings (too few instances, groups not interleaved in time, mixed watches).
- **Gear and tags:** shoes and heart-rate sensors with the dates you used them.

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
| `workers/pipeline.worker.ts` | the Processing Worker: import, recompute, context, blocks |
| `lib/fs` | folder access and the manifest |
| `lib/ingest` | FIT parsing and import |
| `lib/prepare` | 10 s windows, route segments |
| `lib/context` | gear, tags, day state |
| `lib/blocks` | block definitions, detection, recommendations |
| `lib/compare`, `lib/stats` | trend, A/B, regression and bootstrap |

All heavy processing runs in the worker. An architecture test fails if main-thread code imports the processing modules.
