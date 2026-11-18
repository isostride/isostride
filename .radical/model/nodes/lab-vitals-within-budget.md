---
id: "d3d24907-8709-4102-b0e0-fce59ce36880"
type: "scenario"
label: "Lab vitals within budget"
gherkin: "And no measurement is sent over the network"
given: "the static export of a pull request opened with the sample data folder"
then: "LCP is within 2500 ms, Total Blocking Time within 200 ms and CLS at most 0.1 for every screen, and INP is within 200 ms in every journey"
when: "Lighthouse runs 3 times per screen and the Playwright journeys run in Chromium"
---
