---
id: "5f000913-f470-4fb5-8bd5-8121a2631948"
type: "requirement"
label: "Core Web Vitals met"
action: "meet, in lab measurements on every pull request (median of 3 runs per screen on the static export with the sample data folder), a Largest Contentful Paint within 2500 ms, an Interaction to Next Paint within 200 ms in scripted journeys (Total Blocking Time within 200 ms as its Lighthouse stand-in) and a Cumulative Layout Shift of at most 0.1, without collecting any measurement from the runner's browser"
ears_type: "ubiquitous"
rationale: "The web.dev thresholds for a good experience (LCP 2.5 s, INP 200 ms, CLS 0.1), measured in the lab instead of from real users: field data would need telemetry, and in Strideprism the data never leaves the computer."
---
