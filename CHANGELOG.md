# Changelog

The versions of IsoStride (the app at app.isostride.com and the site at isostride.com). A version is raised by hand: write what changed under **Unreleased**, then run `npm run release -- 0.2`, which sets the version in the package files and moves the notes under it. After the merge to master, the deploy tags the commit `v0.2` and publishes these notes as a GitHub release.

## Unreleased

### Languages
- The app in English and Polish: every screen, message and explanation of the models. At first in your browser's language; change it in Settings › Display or in the setup wizard. Numbers and dates follow the language (5,24 km, 24 lis 2026).
- The site in Polish too, at isostride.com/pl, with EN and PL in its header; a first visit from a browser in Polish opens it.

### On a phone
- Every screen, dialog and step of the setup wizard fits a phone: the wizard's steps, the rule of a new segment, the tables (their secondary columns left out), the map of the models read down the screen.

### Performance models, reviewed
- rTSS and Power TSS: the automatic threshold is taken only from bests that show all-out short efforts (D′ worth 12 s or more at the critical speed); weeks of easy running keep the last such threshold instead of lowering it to the easy pace.
- Péronnet–Thibault: the decline past 7 minutes is fitted only with bests of 30 minutes or more; without them it is Riegel's 1.06, and the note says so. The anaerobic reserve declines by the authors' constant.
- Fitness, fatigue, form and the acute:chronic ratio start from the mean load of the first 28 days, not from zero; the ratio is computed as Williams et al. 2017.
- A best of a length is a stretch of that whole length (a 30 s best was taken from 28 s). The bests of pace on Performance come from the effort pace where the watch gives it, else leave out downhills.
- Intensity shares by Seiler's zones of the maximum heart rate (under 82 %, 82–87 %, above 87 %), apart from the zones of Settings.
- The fitted Banister model needs 15 performances and is judged by its cross-validated R².
- The automatic maximum heart rate from a 10 s window, a sensor's spike left out; VO2max from heart rate past the warm-up and on the effort pace; Edwards' TRIMP counts nothing under 50 % of the maximum; the current week's markers and monotony up to today.

### Performance models, extended
- How far today's critical speed, D′, critical power, W′ and predicted times may lie: each with its range, by the bests left out one at a time (the jackknife); the checks say whether the bests settle the critical speed and power.
- D′ balance on the Run screen: how much of the reserve above the critical speed (and W′ above the critical power) is left through the run, with its lowest point (Skiba 2015).
- What if on the load: the fitted response of each measure (VO2max from heart rate, VDOT) run over the weeks of the scenario, against resting from today.

### Other
- Release notes of the version shown, from Settings › About and the site's footer.

## 0.1 — 2026-11-24

The first version of IsoStride: an open source tool for analysing the metrics of your runs and modelling your performance, in your browser, with your data on your own disk.

### Your data, local
- Reads the FIT files of a folder you choose (Chrome, Edge or Opera on a desktop, through the File System Access API). Tested on COROS and Garmin files, Garmin smart recording included.
- No server and no account: everything the app computes is kept next to your files in `.isostride/`, as JSON files you can open, copy or delete. Every file records the version of the app that wrote it.
- Imports new files on its own when the folder is opened; Recompute rebuilds everything from the FIT files; the processing runs in a background worker and reuses what is already computed.
- Setup wizard: the runs, your heart rate (resting and maximum), the zones, your gear and the load model, step by step.

### Metrics
- Every numeric field of a file is a metric, the developer fields of watch apps included (COROS Form Power, Stryd, Garmin running dynamics…), on every screen.
- Which way is better for each metric (higher or lower), the app's own for the metrics it knows, set by you for the others.
- Zones for any metric, from green (Z1) to red, with defaults to start from and Fill from max HR.

### Dashboard
- Tiles you choose, order and size: this week, weekly distance, last run, form today, recent runs, a run, a segment's trend, a saved analysis, a model's value, a chart of Performance.
- Pin a run, a segment, an analysis or a model to it from its own screen.

### Runs
- List and calendar of your runs, with search by words, workout type, distance and month.
- Title, workout type, technique cue, shoes worn and a note for each run, from the list or the run's own screen.

### A run
- Up to four metrics on one chart, second by second as the watch recorded them: in bands or overlaid, by time or by distance, smoothed or raw.
- Zoom by wheel, pinch or a dragged selection; laps; the zones of a metric as coloured stripes.
- Statistics of the selection: minimum, average and maximum of each metric, trend, time in zones, pace to heart rate decoupling.
- The route on a map (map tiles optional, off by default), large with the route coloured by any metric.
- Efforts of your segments in the run; Find similar from a selection.

### Segments
- One way to define a segment, as a rule: the whole run, its laps, the fastest stretch of a time or distance, a steady stretch, the main effort, the effort laps of a workout, a route you run often, or a stretch with the same profile; with conditions on pace, heart rate and more, and checks every effort must pass.
- Segments suggested from your runs, to keep or dismiss.

### Compare
- Trends: a metric of a segment over months, with a fitted trend, its noise threshold, the changes of gear and a table of changes.
- A/B: the same segment split by shoes, heart rate sensor, watch, workout type or technique cue, with the difference, its 95% interval and a warning when the comparison is not a fair one.
- Efforts on one chart; pace and power curves with their estimates.
- Saved analyses; CSV export of every segment with its metrics and context.

### Performance
- The models grouped by the evidence they rest on, with an overview map of what rests on what and how far each can be trusted (Reliable, Rough, Not reliable, No data), and Why? for each.
- Load: training load of every run (Banister TRIMP, Edwards TRIMP, rTSS or power TSS, chosen in Settings), fitness, fatigue and form (Banister's impulse-response model), acute:chronic ratio, weekly load, monotony and strain, intensity distribution and time in heart rate zones.
- Capacity: best efforts of 2–20 minutes, critical speed and D′, critical power and W′, race predictions (Riegel) and VDOT (Daniels and Gilbert).
- Aerobic: efficiency factor, aerobic decoupling, VO2max from heart rate and by Uth's ratio.
- Response: the impulse-response model fitted to your own results, on VO2max from heart rate and on VDOT.

### Settings
- Models (the load model, your heart rate, threshold pace and power, the thresholds of the checks), Metrics (zones and which way is better), Gears (shoes and heart rate sensors with their dates of use), Tags, Display (light or dark theme, map background, side menu, how charts draw) and About.
- Gear and tags renamed or deleted in one editor; the segments' rules that name them follow.

### Everywhere
- Command palette (⌘K) to reach any screen, run or action from the keyboard.
- Layout for a phone, light and dark themes, WCAG 2.2 AA accessibility, no layout shift.
- Open source (MIT): the code, its tests and its model of requirements on GitHub.
