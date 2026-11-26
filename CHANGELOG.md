# Changelog

The versions of IsoStride (the app at app.isostride.com and the site at isostride.com). A version is raised by hand: write what changed under **Unreleased**, then run `npm run release -- 0.2`, which sets the version in the package files and moves the notes under it. After the merge to master, the deploy tags the commit `v0.2` and publishes these notes as a GitHub release.

## Unreleased

### Languages
- The app in English and Polish: every screen, message and explanation of the models. At first in your browser's language; change it in Settings › Display or in the setup wizard. Numbers and dates follow the language (5,24 km, 24 lis 2026).
- The site in Polish too, at isostride.com/pl, with EN and PL in its header; a first visit from a browser in Polish opens it.

### On a phone
- Every screen, dialog and step of the setup wizard fits a phone: the wizard's steps, the rule of a new segment, the tables (their secondary columns left out), the map of the models read down the screen.
- The run chart by finger: a drag sideways selects a part, two fingers zoom and move the range, a tap shows the values, two taps on a lap select it; a drag up or down still scrolls the page. The strip of the whole run works by finger as by mouse, and a tap on the small map picks a point of the route.

### Third review: statistics, segments, data, screens
- A/B and trends corrected for pace: the 95 % interval now holds what the correction costs (the difference at one pace from one fit of the group or the day with the pace). With no change at all, a trend over runs whose pace drifted read "change" in 3 series of 10, and two groups apart in pace in 2 of 10. The A/B export names the runs beside the efforts.
- The Efforts table colours a change better or worse only when it is at least the least the eye takes for one (5 s/km of pace, 2.5 bpm) and past the spread that can be measured; the trend per week when its interval leaves zero out.
- Whole curve (Péronnet–Thibault, omni-domain): the runner's own decline is fitted to the all-out bests only (one raced half hour among easy long runs read a marathon of 3:21 as 4:09); the decline taken when no long best settles it follows Riegel's law itself, not its slope at 7 minutes (the marathon read 3.5 % slow).
- Maximum heart rate from the runs: a peak far above every other run is the sensor's only when it was not held for a minute (the one race of a season was set aside). The ranges of critical speed, D′ and the predicted times never go below zero, and no longer claim 95 %. Medians of two values lie between them. Intensity of "12 weeks" is of the last 12 weeks of the calendar. A week's monotony needs 7 days of history. The automatic threshold pace is written as a pace (it read "0:04 /km").
- Routes: a pass up to a turnaround is found (a third were missed), and each lap of a loop of 400 m or less is its own pass. A path longer than 3 km with no junction gives route segments. An easy run on auto-laps with one press of the lap button is no workout.
- Runs recorded smart: their pace, their bests of power and of effort pace and their loads no longer leave out the gaps of 6 and 7 s (an hour at 5:00/km read 2:41/km); a run is taken for one by the share of its gaps, not their median.
- Rules: "another metric" is asked of the fastest stretches too; the start (standing, flying) of reps, routes and profiles too. The fastest stretch of a time is the fastest, not the one that covered most. An effort starting on a sample without a distance has its own distance.
- Import: its progress is written every 50 files; files that are not runs are not read again at every import; an import cut off between its two last writes is finished, not read as a duplicate of itself; a record dated a year off (the watch's clock set mid-run) is left out; a developer field's scale and offset are applied. Two tabs opened after an update rebuild once. COROS: runs synced late are found (the list reaches 30 days back).
- A folder that was moved or whose disk is away is said so, with the choice of a folder (the app stayed on an empty page). A screen that cannot read its data says so, with Try again.
- On a phone's copy: a note saved as the browser is left is no longer taken back by the next save.
- Screens: times never read "4:60"; a number that writes as zero has no minus; zone boundaries take a decimal comma ("9,5; 10,5"); the setup wizard refuses what Settings refuses; saved analyses and tags are saved into the file as it is, so one deleted or noted elsewhere does not come back or vanish; five dialogs keep Tab inside; a run opens from the keyboard; the chart leaves the page its wheel when it cannot zoom, and the browser its shortcuts; axis labels of Performance carry the decimals of their ticks.
- The segments and the summaries are made again once.

### Comparisons, data and privacy, reviewed
- A/B and trends count runs, not single efforts: the reps of one run are one measurement. A verdict needs 4 runs on each side (5 for a trend), and the 95 % interval is Welch's on the runs' means (the bootstrap over efforts was too narrow for so few).
- The pace correction no longer takes away what is compared: in A/B it uses the slope inside the groups (a real +5 bpm read +0.4), in a trend the slope of pace beside time; effort pace is never corrected.
- The noise band of a trend is the spread about its line, not of all its values; the check that two groups take turns in time no longer passes on one stray run; several metrics judged at once say so.
- Segments: "fastest N minutes" lasts N minutes (it was 2 s short); a segment's distance runs to its end (1 km in 4:00 read 4:01 /km); a lap that fits both a time and a distance is read as the other reps of its set; runs recorded smart (a sample every few seconds) keep their segments. The segments are found again once.
- Import: an import cut off before it finished is completed by the next one or as the app opens; a folder built by an older version stays marked for its rebuild; a file of several sports gives its running leg; two tabs on one folder take turns writing.
- Settings › Models: values out of range or against each other are named and not saved (they were replaced by defaults in silence); saving the model no longer takes back the thresholds of the checks. Gear and tags added one after the other no longer overwrite each other.
- A link to a run with an absurd range no longer hangs the tab; the model tiles of the Dashboard follow an import; the D′ balance and map dialogs keep Tab inside and give the focus back.
- CSV exports guard cells a spreadsheet would run as formulas. Both sites answer with a Content-Security-Policy.

### Performance models, reviewed again
- Péronnet–Thibault and the omni-domain model: the decline past 7 (30) minutes is the runner's own only when a best of 30 minutes or more lies within 3 % of the curve with Riegel's decline, or above it. Easy long runs bent the curve down to them (a marathon of 2:55 read as 3:14 to 4:18); they are now taken for easy runs, and the note says whose decline it is. Without such a best the omni-domain model takes Riegel's decline too, not none.
- D′ balance of a run is read against the bests of the 90 days before the run, the run itself left out: a run that goes past them shows under 0 % (with the run in, it ended at exactly 0 %).
- The ranges of the markers leave out each run in turn, not each best: one hard effort leaves a best of every shorter length.
- Fitted response: beside each time constant, the range of those that fit as well (95 %); fitness is taken to last twice as long as fatigue at least. On VDOT, a performance is the VDOT of a day's all-out efforts of 5 minutes or more, on the day they were run, in place of the weekly VDOT of the best of 90 days.
- Weekly load: the first week's ramp no longer holds the load the averages start from; the monotony and strain of a week not over yet are those of the last 7 days (a Monday of 100 and a Tuesday of 90 read a monotony of 19).
- Decoupling is read past the first 10 minutes: a heart rate still rising in the warm-up read as 4 % of drift.
- Intensity: the mark on the bar stands at 90 % low, what 80 % of sessions run easy comes to by time in zone (Seiler & Kjerland 2006). Easy runs of the efficiency factor are those under 82 % of the maximum heart rate, not those of the zones of Settings.
- VO2max from heart rate and the efficiency now are those of the days up to today, not up to the last run.
- rTSS and Power TSS with an automatic threshold say how they stand against scores that take the pace or power of an hour.

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
