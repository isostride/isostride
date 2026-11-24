# Changelog

The versions of IsoStride (the app at app.isostride.com and the site at isostride.com). A version is raised by hand: write what changed under **Unreleased**, then run `npm run release -- 0.2`, which sets the version in the package files and moves the notes under it. After the merge to master, the deploy tags the commit `v0.2` and publishes these notes as a GitHub release.

## Unreleased

## 0.1 — 2026-11-24

The first version.

- Reads the FIT files of a folder on your disk (COROS and Garmin tested, Garmin smart recording included) and keeps everything it computes next to them in `.isostride/`. No server, no account.
- Every numeric field of a file is a metric, the developer fields of watch apps included.
- A run on one chart, second by second: up to four metrics, zones from green to red, laps, the route on a map, statistics of any selection.
- Segments: routes, laps of a workout or your own rules, found in every run.
- Compare: a segment over months with its trend and noise threshold, A/B comparisons by shoes, sensor, watch or workout type, efforts on one chart, pace and power curves, CSV export.
- Performance models: training load (TRIMP, rTSS, power TSS), fitness, fatigue and form, critical speed and D′, critical power and W′, race predictions, VO2max, intensity distribution, aerobic efficiency.
- Dashboard, setup wizard, settings for zones, metrics, gear, tags, charts and display.
