---
id: "6f3356ad-6424-489d-bc61-804df1409cfa"
type: "scenario"
label: "Static export builds"
gherkin: "And the application opened from out/ with a plain static file server reaches the Welcome screen"
given: "a release of Strideprism"
then: "out/ holds a pre-built page for each of the six screens and no server-side code"
when: "it is built with output: 'export'"
---
