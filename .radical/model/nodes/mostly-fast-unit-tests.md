---
id: "21175535-2832-4a69-9b60-984a3f99b920"
type: "requirement"
label: "Mostly fast unit tests"
action: "keep at least 70% of the automated tests as unit tests that touch no network and run in under 100 ms each, and at most 10% as end-to-end tests"
ears_type: "ubiquitous"
rationale: "Tests low in the pyramid are fast, precise about what broke and cheap to keep; high ones are slow and brittle, so few of them (Fowler, TestPyramid; Vocke, The Practical Test Pyramid)."
---
