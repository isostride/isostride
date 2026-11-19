---
id: "db7bc61d-5dad-4fc7-a241-5d1fa31ca854"
type: "adr"
label: "A test pyramid"
alternatives: |
  1. A testing trophy: mostly integration tests, better for glue code, slower feedback.
  2. An ice-cream cone of manual and end-to-end tests: slow, brittle and late; the shape to move away from.
concern: "test-strategy"
consequences: |
  • Fast, precise feedback: a failing unit test names the rule that broke.
  • Refactoring that changes internal interfaces rewrites many unit tests; test behaviour, not methods, to limit it.
  • Wiring bugs (configuration, queries, serialisation) are caught only by the thinner integration layer.
  • Requires code where the logic can be called without infrastructure.
  • The gate costs build time in proportion to what it proves: coverage is free, a mutation score adds minutes.
  • Where the end-to-end tests run decides what they can stop: before the merge, before production, or only after.
context: "Code lives in this element and changes every week; the tests decide whether a change can be released with confidence or only with hope. The forces: fast tests give feedback in minutes but exercise little of the wiring, while end-to-end tests exercise everything but are slow, brittle and late; coverage shows what was run, not what was checked; tests that share data or depend on order fail at random, and a suite that fails at random is soon ignored; copies of production data make realistic tests but carry personal data; and a test that fails only sometimes teaches everyone to rerun until green. Contract tests between the system's parts and with outside callers are decided in the Communication style and API evolution packs."
date: "2026-11-18"
decision: "Tests follow the pyramid, adapted to real data: unit tests of the domain logic under tests/unit run with Vitest on synthetic data, without network access, in under 100 ms each, at least 40% of all tests; integration tests under tests/integration run the processing pipeline against a temporary data folder with the versioned synthetic FIT fixtures (tests/fixtures) and the author's FIT files (test_data, kept out of the repository); a few end-to-end tests, at most 15%, cover import, block-definition, trend, ab-comparison (Playwright, Chromium) against the static export. Every check of a change (npm run check) runs unit and integration tests within 10 minutes, in random order. Gate: coverage of new code, 80%; mutation testing with Stryker is deferred. Flaky tests: quarantine (quarantine.json, nightly run), then a fix or deletion. Local only for now (the author's decision of 19 Nov 2026)."
status: "accepted"
---
