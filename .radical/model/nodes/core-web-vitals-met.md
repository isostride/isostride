---
id: "5f000913-f470-4fb5-8bd5-8121a2631948"
type: "requirement"
label: "Core Web Vitals met"
action: "meet, in lab measurements on every pull request (median of 3 runs per screen on the static export with the sample data folder), a Largest Contentful Paint within 2500 ms, an Interaction to Next Paint within 200 ms in scripted journeys (Total Blocking Time within 200 ms as its Lighthouse stand-in) and no layout shift at all (Cumulative Layout Shift 0) on every screen and tab of the app and on the site's home page, without collecting any measurement from the runner's browser"
ears_type: "ubiquitous"
rationale: "The web.dev thresholds for a good experience (LCP 2.5 s, INP 200 ms, CLS 0.1), measured in the lab instead of from real users: field data would need telemetry, and in Strideprism the data never leaves the computer. The runner then asked for no layout shift at all, on the site too and on every page (\"dodaj glowna strone i ustaw ze layout shift ma byc 0\", \"sprawdz na kazdej podstronie\"). Model's choices: the median of 3 runs per screen; each page loaded and read to its end with a data folder, at 1440 × 900, the CPU four times slower (what comes late on a slow computer comes late in the test too); the site with the system in its light and its dark scheme (the site light only, as the runner asked: \"strone glowna pokazuj tylko w trybie jasnym\") and on a phone."
---
